const CACHE_KEY = 'pokedex-pokemon-data'
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000
const POKEMON_COUNT = 1025
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

function parsePokemonFromDetail(detail) {
  return {
    id: detail.id,
    name: detail.name,
    sprite:
      detail.sprites.other['official-artwork']?.front_default ||
      detail.sprites.front_default ||
      `${SPRITE_BASE}/${detail.id}.png`,
  }
}

async function fetchPokemonList() {
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon?limit=${POKEMON_COUNT}`)
  if (!res.ok) throw new Error(`API returned ${res.status}`)
  const data = await res.json()
  return parsePokemonFromList(data.results)
}

async function fetchPokemonWithDetails() {
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon?limit=${POKEMON_COUNT}`)
  if (!res.ok) throw new Error(`API returned ${res.status}`)
  const data = await res.json()
  const results = data.results

  const BATCH_SIZE = 20
  const withDetails = []
  for (let i = 0; i < results.length; i += BATCH_SIZE) {
    const batch = results.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map(async (p) => {
        const detailRes = await fetch(p.url)
        if (!detailRes.ok) throw new Error(`Detail fetch failed: ${detailRes.status}`)
        const detail = await detailRes.json()
        return parsePokemonFromDetail(detail)
      })
    )
    withDetails.push(...batchResults)
  }
  return withDetails
}

export async function fetchPokemon() {
  try {
    const pokemon = await fetchPokemonWithDetails()
    saveCachedPokemon(pokemon)
    return pokemon
  } catch {
    const pokemon = await fetchPokemonList()
    saveCachedPokemon(pokemon)
    return pokemon
  }
}

export async function loadPokemon({ onCached, onUpdated, onError }) {
  const cached = loadCachedPokemon()
  if (cached) {
    onCached(cached.pokemon, cached.stale)
    if (!cached.stale) return
  }

  try {
    const pokemon = await fetchPokemon()
    onUpdated(pokemon)
  } catch (err) {
    if (cached) return
    onError(err.message)
  }
}
