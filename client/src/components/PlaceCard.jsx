const PRICE_LABELS = {
  budget: 'Budget',
  mid: 'Mid-range',
  premium: 'Premium',
};

export default function PlaceCard({ place }) {
  return (
    <article className="card place-card">
      <header className="place-head">
        <h3 className="place-name">{place.name}</h3>
        {place.price_level && (
          <span className={`pill pill--${place.price_level}`}>
            {PRICE_LABELS[place.price_level] ?? place.price_level}
          </span>
        )}
      </header>
      <p className="place-area">{place.area}</p>
      <p className="place-desc">{place.description}</p>
    </article>
  );
}
