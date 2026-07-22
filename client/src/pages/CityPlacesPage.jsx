import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import PlaceCard from '../components/PlaceCard.jsx';

const CATEGORIES = [
  { key: 'tourist_spot', label: 'Things to see' },
  { key: 'stay', label: 'Places to stay' },
  { key: 'restaurant', label: 'Restaurants' },
  { key: 'cafe', label: 'Cafes' },
];

export default function CityPlacesPage() {
  const { cityId } = useParams();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [active, setActive] = useState('tourist_spot');

  useEffect(() => {
    setStatus('loading');
    // Fetch all four categories at once and switch tabs client-side —
    // 28 rows per city is small enough that per-tab requests aren't worth it.
    api
      .places(cityId)
      .then((res) => {
        setData(res);
        setStatus('ready');
      })
      .catch((err) => {
        setError(err.message);
        setStatus('error');
      });
  }, [cityId]);

  if (status === 'loading') return <p className="muted">Loading places…</p>;
  if (status === 'error') return <p className="error">Could not load places: {error}</p>;

  const places = data.placesByCategory[active] ?? [];

  return (
    <>
      <Link to="/cities" className="back-link">← All cities</Link>
      <h2 className="page-title">{data.city.name}</h2>
      <p className="muted subtitle">{data.total} places</p>

      <div className="tabs tabs--wide" role="tablist">
        {CATEGORIES.map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={active === key}
            className={active === key ? 'tab tab--active' : 'tab'}
            onClick={() => setActive(key)}
          >
            {label}
            <span className="tab-count">{data.placesByCategory[key]?.length ?? 0}</span>
          </button>
        ))}
      </div>

      {places.length === 0 ? (
        <p className="muted">Nothing listed in this category yet.</p>
      ) : (
        <ul className="place-grid">
          {places.map((place) => (
            <li key={place.id}>
              <PlaceCard place={place} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
