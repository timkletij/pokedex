const CACHE_KEY = 'pokedex-pokemon-data'
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000
const API_TIMEOUT = 10000
const POKEMON_COUNT = 1025
const FALLBACK_URL = '/pokemon-fallback.json'
const SPRITE_BASE =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork'

export function loadCachedPokemon() {
  try {
    const stored = localStorage.getItem(CACHE_KEY)
    if (!stored) return null
    const { fetchedAt, pokemon } = JSON.parse(stored)
    if (!Array.isArray(pokemon) || pokemon.length === 0) return null
    return {
      pokemon,
      stale: Date.now() - fetchedAt > CACHE_MAX_AGE,
    }
  } catch {
    return null
  }
}

function saveCachedPokemon(pokemon) {
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({ fetchedAt: Date.now(), pokemon })
  )
}

function parsePokemonFromList(results) {
  return results.map((p) => {
    const id = parseInt(p.url.match(/\/(\d+)\/?$/)?.[1] ?? '0', 10)
    return {
      id,
      name: p.name,
      sprite: `${SPRITE_BASE}/${id}.png`,
    }
  })
}

async function fetchWithTimeout(url, ms = API_TIMEOUT) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`API returned ${res.status}`)
    return res
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchPokemonList() {
  const res = await fetchWithTimeout(
    `https://pokeapi.co/api/v2/pokemon?limit=${POKEMON_COUNT}`
  )
  const data = await res.json()
  return parsePokemonFromList(data.results)
}

async function fetchBundledFallback() {
  const res = await fetch(FALLBACK_URL)
  if (!res.ok) throw new Error('Bundled fallback unavailable')
  const pokemon = await res.json()
  if (!Array.isArray(pokemon) || pokemon.length === 0) {
    throw new Error('Bundled fallback is empty')
  }
  return pokemon
}

export async function fetchPokemon() {
  try {
    const pokemon = await fetchPokemonList()
    saveCachedPokemon(pokemon)
    return { pokemon, source: 'api' }
  } catch {
    const pokemon = await fetchBundledFallback()
    saveCachedPokemon(pokemon)
    return { pokemon, source: 'bundled' }
  }
}

export async function loadPokemon({ onCached, onUpdated, onError }) {
  const cached = loadCachedPokemon()
  let hasData = false

  if (cached) {
    onCached(cached.pokemon, cached.stale, false)
    hasData = true
    if (!cached.stale) return
  } else {
    try {
      const bundled = await fetchBundledFallback()
      onCached(bundled, true, true)
      hasData = true
    } catch {
      // bundled missing — fall through to network attempt
    }
  }

  try {
    const pokemon = await fetchPokemonList()
    saveCachedPokemon(pokemon)
    onUpdated(pokemon, false)
  } catch {
    if (hasData) return
    try {
      const bundled = await fetchBundledFallback()
      saveCachedPokemon(bundled)
      onUpdated(bundled, true)
    } catch (err) {
      onError(err.message)
    }
  }
}
