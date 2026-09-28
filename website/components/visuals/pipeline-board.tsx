/**
 * The pipeline, as the product renders it.
 *
 * "A manager can see where every deal is" is a claim that a board makes
 * self-evident and a paragraph does not. Columns carry counts so the shape of
 * a real funnel — wide at intake, narrow at close — is visible at a glance.
 */

type Card = { name: string; value: string; age: string; stalled?: boolean }

const COLUMNS: { stage: string; count: number; cards: Card[] }[] = [
  { stage: 'New', count: 24, cards: [
    { name: 'Aurora Labs', value: '$12k', age: '2m' },
    { name: 'Kessler GmbH', value: '$8k', age: '1h' },
  ]},
  { stage: 'Contacted', count: 61, cards: [
    { name: 'Northwind', value: '$22k', age: '3h' },
    { name: 'Lagos Medical', value: '$9.4k', age: '1d' },
  ]},
  { stage: 'Quoted', count: 18, cards: [
    { name: 'Meridian', value: '₹4.2L', age: '6d', stalled: true },
    { name: 'Adler Handel', value: '€18k', age: '7d', stalled: true },
  ]},
  { stage: 'Closed', count: 7, cards: [
    { name: 'Vantage Pharma', value: '$31k', age: '2d' },
  ]},
]

export function PipelineBoard({ className }: { className?: string }) {
  return (
    <div className={['board', className].filter(Boolean).join(' ')} aria-hidden="true">
      {COLUMNS.map((col, ci) => (
        <div key={col.stage} className="board__col" style={{ '--i': ci } as React.CSSProperties}>
          <div className="board__head">
            <span className="board__stage">{col.stage}</span>
            <span className="board__count tabular">{col.count}</span>
          </div>
          <div className="board__cards">
            {col.cards.map((card) => (
              <div key={card.name} className="board__card" data-stalled={card.stalled || undefined}>
                <span className="board__name">{card.name}</span>
                <span className="board__meta">
                  <span className="tabular">{card.value}</span>
                  <span className="board__age tabular">{card.age}</span>
                </span>
                {card.stalled && <span className="board__flag">No reply</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
