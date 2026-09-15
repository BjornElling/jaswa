import { Disclosure, PageHeader } from './page-chrome';
import { WorkspacePage } from './workspace-page';

export function TheMathSection() {
  return <WorkspacePage
    header={<PageHeader
      title="The Math"
      tagline="The numbers behind the recommendations. Because “it felt right” is not a calculation." />}
  >
    <Disclosure title="Rune Optimization" sessionKey="the-math.runes" defaultOpen>
      <div className="math-copy">
        <p className="lead">
          Rune math is still in the workshop. This section will explain how JASWA turns the targets you set for a monster into rune recommendations.
        </p>
      </div>
    </Disclosure>

    <Disclosure title="Artifact Optimization" sessionKey="the-math.artifacts">
      <div className="math-copy">
        <p className="lead">
          JASWA checks every readable artifact that can fit the monster. A preferred stat earns full credit, an acceptable stat earns the percentage you choose in Artifact settings, and an unwanted stat earns none. The four substats are scored by how well they rolled, and the main stat adds its own small share. The highest score is recommended for that artifact category.
        </p>

        <article className="math-example" aria-labelledby="artifact-math-example-title">
          <h3 id="artifact-math-example-title" className="type-heading">A small example</h3>
          <p>
            If acceptable stats are worth 50%, a perfect preferred substat is worth 5 points. One acceptable roll is worth 0.5 points. Add a preferred main stat worth 2 points:
          </p>
          <p className="math-equation" aria-label="2 plus 5 plus 0.5 equals 7.5 points">
            <span>2</span><span aria-hidden="true">+</span><span>5</span><span aria-hidden="true">+</span><span>0.5</span><span aria-hidden="true">=</span><b className="type-body-emphasis">7.5 points</b>
          </p>
          <p>
            That is 100% of JASWA’s reference artifact for this setting. A lower score simply means a weaker match. Filters can hide rows, but they do not change the score.
          </p>
        </article>
      </div>
    </Disclosure>

    <Disclosure title="Relic Optimization" sessionKey="the-math.relics">
      <div className="math-copy">
        <p className="lead">
          JASWA gives each relic a score for each monster. It looks at how well the main property fits, how well the unique property fits, and how useful that pair is together. When available, it uses that monster’s own engraving statistics; your saved monster preferences can answer the property questions directly. The relic’s current level then scales the result. The best score wins for that monster, unless the relic is already full or the change would be too small to be worth the work.
        </p>

        <article className="math-example" aria-labelledby="relic-math-example-title">
          <h3 id="relic-math-example-title" className="type-heading">A small example</h3>
          <p>
            Suppose a relic scores 100% for the main property, 50% for the unique property, and 75% for the pair working well together. JASWA combines those three parts like this:
          </p>
          <p className="math-equation" aria-label="30 percent times 100 percent plus 20 percent times 50 percent plus 50 percent times 75 percent equals 77.5 percent">
            <span>30% × 100%</span><span aria-hidden="true">+</span><span>20% × 50%</span><span aria-hidden="true">+</span><span>50% × 75%</span><span aria-hidden="true">=</span><b className="type-body-emphasis">77.5% fit</b>
          </p>
          <p>
            If the relic is currently at 75% of its maximum strength, its final score is 75% × 77.5% = 58.1%. JASWA compares that result with the other relics for the same monster. A relic can be engraved on up to 150 monsters, so a full relic may be unavailable even when it would otherwise be the best match.
          </p>
        </article>
      </div>
    </Disclosure>
  </WorkspacePage>;
}
