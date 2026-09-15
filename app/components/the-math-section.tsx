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
          JASWA checks every artifact that fits the monster’s category and equip class. Each one earns a score on a 0–100 % scale, and behind that scale sits a points system where 100 % equals 7.5 points.
        </p>

        <h3 className="type-heading">Substats</h3>
        <p>
          A maximum roll into a preferred substat counts as 1 point. That treats every preferred substat as equally valuable, which in the game they are not — but it is an acceptable compromise. Working out an individual value for each substat on each monster would take forever and would still end up subjective and arguable.
        </p>
        <p>
          Every substat has its own maximum roll, and a line simply counts the maximum rolls it amounts to. <i>Additional Damage by ATK</i> rolls at most 4 % at a time, so a line showing 12 % is three maximum rolls and earns 3 points. A line need not land on a whole number of rolls: where the maximum roll is 14 % and the line shows 7 %, that is half a roll, so 0.5 points.
        </p>
        <p>
          Acceptable substats are scored exactly like preferred ones and then reduced proportionally, by the tolerance you set for acceptable substats in Artifact settings. The default is 50 %, so an acceptable substat that rolled half its maximum earns 0.25 points. An unwanted substat earns nothing at all.
        </p>

        <h3 className="type-heading">Main stat</h3>
        <p>
          A preferred main stat counts as 2 points, which is worth two maximum rolls into a preferred substat. A more exact value would depend heavily on the monster’s own skills — for an attack-based main stat, on how many hits each individual monster lands. Two maximum rolls is a good, defensible compromise. The main stat is added to the score rather than multiplied into it, so an artifact carrying the wrong main stat keeps everything its substats earned and forfeits only these 2 points.
        </p>

        <h3 className="type-heading">The 100 % artifact</h3>
        <p>
          This reference exists purely to normalise the scores onto a sensible scale. Nothing more. Exceptional artifacts can and do score above 100 %.
        </p>
        <p>
          The theoretical 100 % artifact carries the preferred main stat, four maximum rolls’ worth of a preferred substat, and three acceptable substats. With acceptable substats at the default 50 %, the preferred substat line is worth 4 points and the three acceptable lines 1.5 points between them. Add the preferred main stat’s 2 points:
        </p>
        <p className="math-equation" aria-label="2 plus 4 plus 1.5 equals 7.5 points">
          <span>2</span><span aria-hidden="true">+</span><span>4</span><span aria-hidden="true">+</span><span>1.5</span><span aria-hidden="true">=</span><b className="type-body-emphasis">7.5 points</b>
        </p>
        <p>
          A lower score simply means a weaker match. Filters can hide rows, but they never change the score.
        </p>

        <article className="math-example" aria-labelledby="artifact-math-example-title">
          <h3 id="artifact-math-example-title" className="type-heading">A worked example</h3>
          <p>
            A Wind attribute artifact with an ATK main stat, scored against <b className="type-body-emphasis">Brandia</b>, whose recorded preferences are an ATK main stat, <i>Additional Damage by ATK</i> as the preferred substat, and four acceptable substats. Acceptable substats are left at the default 50 %.
          </p>
          <div className="math-table-scroll">
            <table className="math-table">
              <caption className="visually-hidden">
                Each substat of the example artifact, the maximum roll of that substat, the number of maximum rolls the line amounts to, and the points it earns
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="align-left">Substat</th>
                  <th scope="col">Rolled</th>
                  <th scope="col">Max roll</th>
                  <th scope="col">Max rolls</th>
                  <th scope="col">Rank</th>
                  <th scope="col">Points</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row" className="align-left">Additional Damage by ATK</th>
                  <td>12 %</td><td>4 %</td><td>3.00</td><td>Preferred</td><td>3.00</td>
                </tr>
                <tr>
                  <th scope="row" className="align-left">Damage Dealt on Wind</th>
                  <td>8 %</td><td>5 %</td><td>1.60</td><td>Acceptable</td><td>0.80</td>
                </tr>
                <tr>
                  <th scope="row" className="align-left">Own turn 1-target CRIT DMG</th>
                  <td>5 %</td><td>4 %</td><td>1.25</td><td>Acceptable</td><td>0.63</td>
                </tr>
                <tr>
                  <th scope="row" className="align-left">CRIT DMG as enemy HP is more</th>
                  <td>4 %</td><td>6 %</td><td>0.67</td><td>Acceptable</td><td>0.33</td>
                </tr>
                <tr className="math-table-total">
                  <th scope="row" className="align-left">ATK main stat</th>
                  <td /><td /><td /><td>Preferred</td><td>2.00</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="math-equation" aria-label="6.76 points divided by 7.5 points equals 90 percent">
            <span>6.76</span><span aria-hidden="true">/</span><span>7.5</span><span aria-hidden="true">=</span><b className="type-body-emphasis">90 %</b>
          </p>
          <p>
            <i>Additional Damage by ATK</i> rolls at most 4 % at a time, so its 12 % is three maximum rolls and earns 3 points in full — it is Brandia’s preferred substat. <i>Damage Dealt on Wind</i> rolls at most 5 %, so its 8 % is 1.60 maximum rolls, and the acceptable tolerance halves that to 0.80 points. The other two acceptable lines are halved the same way. Together with the 2 points for the preferred main stat, the artifact reaches 6.76 of the reference artifact’s 7.5 points.
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
