import { useState, useEffect, useCallback } from 'react'
import { loadPokemon, fetchPokemon } from './pokemonData'
import './App.css'

const STORAGE_KEY = 'pokedex-owned'
const POKEMON_COUNT = 1025

function loadOwned() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? new Set(JSON.parse(stored)) : new Set()
  } catch {
    return new Set()
  }
}

function saveOwned(owned) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...owned]))
}

function getOwnedFromUrl() {
  const params = new URLSearchParams(window.location.search)
  const encoded = params.get('ids')
  if (!encoded) return null
  try {
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const ids = []
    for (let i = 0; i < POKEMON_COUNT; i++) {
      if (bytes[i >> 3] & (1 << (i & 7))) ids.push(i + 1)
    }
    return new Set(ids)
  } catch {
    return null
  }
}

function encodeOwned(owned) {
  const bytes = new Uint8Array(Math.ceil(POKEMON_COUNT / 8))
  for (const id of owned) {
    if (id >= 1 && id <= POKEMON_COUNT) bytes[(id - 1) >> 3] |= 1 << ((id - 1) & 7)
  }
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_')
}

function App() {
  const [pokemon, setPokemon] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [owned, setOwned] = useState(() => {
    const fromUrl = getOwnedFromUrl()
    if (fromUrl) {
      saveOwned(fromUrl)
      return fromUrl
    }
    return loadOwned()
  })
  const [shareCopied, setShareCopied] = useState(false)
  const [installPrompt, setInstallPrompt] = useState(null)
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [usingCache, setUsingCache] = useState(false)
  const [usingFallback, setUsingFallback] = useState(false)

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setInstallPrompt(e)
      setShowInstallBanner(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = useCallback(async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setShowInstallBanner(false)
    setInstallPrompt(null)
  }, [installPrompt])

  const toggleOwned = useCallback((id) => {
    setOwned((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      saveOwned(next)
      return next
    })
  }, [])

  const createShareLink = useCallback(async () => {
    const link = `${window.location.origin}${window.location.pathname}?ids=${encodeOwned(owned)}`
    await navigator.clipboard.writeText(link)
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
  }, [owned])

  const refreshPokemon = useCallback(async () => {
    setLoading(true)
    setError(null)
    setUsingCache(false)
    setUsingFallback(false)
    try {
      const { pokemon, source } = await fetchPokemon()
      setPokemon(pokemon)
      setUsingFallback(source === 'bundled')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    loadPokemon({
      onCached: (data, stale, fromFallback) => {
        if (cancelled) return
        setPokemon(data)
        setLoading(false)
        setUsingCache(stale && !fromFallback)
        setUsingFallback(fromFallback)
      },
      onUpdated: (data, fromFallback) => {
        if (cancelled) return
        setPokemon(data)
        setLoading(false)
        setUsingCache(false)
        setUsingFallback(fromFallback)
        setError(null)
      },
      onError: (message) => {
        if (cancelled) return
        setError(message)
        setLoading(false)
      },
    })

    return () => {
      cancelled = true
    }
  }, [])

  const filtered = search.trim()
    ? pokemon.filter((p) => {
        const q = search.toLowerCase().trim()
        return (
          p.name.toLowerCase().includes(q) ||
          String(p.id).includes(q)
        )
      })
    : pokemon

  const ownedCount = owned.size

  if (error) {
    return (
      <div className="app">
        <div className="error">
          <p>Failed to load Pokemon: {error}</p>
          <p>Check your connection and try again.</p>
          <button className="retry-btn" onClick={refreshPokemon}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <div className="logo-icon" />
            <h1>Pokedex</h1>
          </div>
          <div className="stats">
            <span className="stats-count">{ownedCount}</span>
            <span className="stats-total">/ {pokemon.length} owned</span>
          </div>
          {showInstallBanner && (
            <button className="install-btn" onClick={handleInstall} title="Install app">
              Install
            </button>
          )}
          <button className="share-btn" onClick={createShareLink} title="Copy shareable link">
            {shareCopied ? '✓ Copied!' : 'Share'}
          </button>
          {usingFallback && (
            <span className="cache-badge" title="PokeAPI unavailable — using bundled data">
              Offline data
            </span>
          )}
          {usingCache && !usingFallback && (
            <span className="cache-badge" title="Showing cached data while refreshing">
              Cached
            </span>
          )}
          <div className="search">
            <div className="search-wrapper">
              <input
                type="text"
                placeholder="Search Pokemon..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
      </header>

      <main className="main">
        {loading ? (
          <div className="loading">
            <div className="loading-spinner" />
            <p>Loading Pokemon...</p>
          </div>
        ) : (
          <div className="grid">
            {filtered.map((p) => (
              <div
                key={p.id}
                className={`card ${owned.has(p.id) ? 'owned' : ''}`}
                onClick={() => toggleOwned(p.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggleOwned(p.id)
                  }
                }}
              >
                <div className="card-check">
                  {owned.has(p.id) ? '✓' : ''}
                </div>
                <div className="card-sprite">
                  <img
                    src={p.sprite}
                    alt={p.name}
                    loading="lazy"
                  />
                </div>
                <div className="card-name">{p.name}</div>
                <div className="card-id">#{String(p.id).padStart(3, '0')}</div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export default App
