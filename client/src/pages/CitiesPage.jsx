import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function CitiesPage() {
  const [cities, setCities] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .cities()
      .then((data) => {
        setCities(data.cities);
        setStatus('ready');
      })
      .catch((err) => {
        setError(err.message);
        setStatus('error');
      });
  }, []);

  if (status === 'loading') return <p className="muted">Loading cities…</p>;
  if (status === 'error') return <p className="error">Could not load cities: {error}</p>;
  if (cities.length === 0) {
    return <p className="muted">No cities yet. Run <code>npm run seed</code> in /server.</p>;
  }

  return (
    <>
      <h2 className="page-title">Where are you going?</h2>
      <ul className="city-grid">
        {cities.map((city) => (
          <li key={city.id}>
            <Link to={`/cities/${city.id}`} className="card city-card">
              <span className="city-name">{city.name}</span>
              <span className="city-arrow" aria-hidden="true">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
