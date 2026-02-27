import { useState, useEffect, useCallback } from 'react'
import './App.css'

const STORAGE_KEY = 'pokedex-owned'

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
    for (let i = 0; i < 1051; i++) {
      if (bytes[i >> 3] & (1 << (i & 7))) ids.push(i + 1)
    }
    return new Set(ids)
  } catch {
    return null
  }
}

function encodeOwned(owned) {
  const bytes = new Uint8Array(132)
  for (const id of owned) {
    if (id >= 1 && id <= 1051) bytes[(id - 1) >> 3] |= 1 << ((id - 1) & 7)
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

  const fetchPokemon = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('https://pokeapi.co/api/v2/pokemon?limit=1051')
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
            const detail = await detailRes.json()
            return {
              id: detail.id,
              name: detail.name,
              sprite: detail.sprites.other['official-artwork']?.front_default ||
                detail.sprites.front_default,
            }
          })
        )
        withDetails.push(...batchResults)
      }
      setPokemon(withDetails)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPokemon()
  }, [fetchPokemon])

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
          <button className="retry-btn" onClick={fetchPokemon}>
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
          <button className="share-btn" onClick={createShareLink} title="Copy shareable link">
            {shareCopied ? '✓ Copied!' : 'Share'}
          </button>
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
