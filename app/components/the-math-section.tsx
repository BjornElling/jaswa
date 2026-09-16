import { Disclosure, PageHeader } from './page-chrome';
import { WorkspacePage } from './workspace-page';

export function TheMathSection() {
  return <WorkspacePage
    header={<PageHeader
      title="The Math"
      tagline="The numbers behind the recommendations. Because “it felt right” is not a calculation." />}
  >
    <Disclosure title="Rune Clean-up" sessionKey="the-math.runes" defaultOpen>
      <div className="math-copy">
        <p className="lead">
          Rune math is still in the workshop. This section will explain how JASWA turns the targets you set for a monster into rune recommendations.
        </p>
      </div>
    </Disclosure>

    <Disclosure title="Artifact Optimization" sessionKey="the-math.artifacts">
      <div className="math-copy">
        <p className="lead">
          JASWA checks every artifact that fits the monster’s category and equip class. Each one earns a number of points, which is then converted into a score on a 0–100 % scale.
        </p>

        <h3 className="type-heading">Substats</h3>
        <p>
          A maximum roll into a preferred substat counts as 1 point. That treats every preferred substat as equally valuable, which in the game they are not — but it is an acceptable compromise. Working out an individual value for each substat on each monster would take forever and would still end up subjective and arguable.
        </p>
        <p>
          Every substat has its own maximum roll, and a line simply counts the maximum rolls it amounts to. <i>Additional Damage by ATK</i> rolls at most 4 % at a time, so a line showing 12 % is three maximum rolls and earns 3 points. A line need not land on a whole number of rolls: where the maximum roll is 4 % and the line shows 2 %, that is half a roll, so 0.5 points.
        </p>
        <p>
          Acceptable substats are scored exactly like preferred ones and then reduced proportionally, by the tolerance you set for acceptable substats in Artifact settings. The default is 50 %, so an acceptable substat that rolled half its maximum earns 0.25 points. An unwanted substat earns nothing at all.
        </p>

        <h3 className="type-heading">Main stat</h3>
        <p>
          A preferred main stat counts as 2 points, so the calculation treats it as being worth the same as two maximum rolls into a preferred substat. A more exact value would depend heavily on the monster’s own skills — for an attack-based main stat, on how many hits each individual monster lands. Two maximum rolls is a good, defensible compromise. The main stat is added to the score, so an artifact carrying the wrong main stat keeps everything its substats earned and forfeits only these 2 points.
        </p>

        <h3 className="type-heading">Normalisation</h3>
        <p>
          A score of 7.5 points is considered 100 %. That reference exists purely to put the scores on a sensible scale. Nothing more. Exceptional artifacts can and do score above 100 %.
        </p>
        <p>
          That figure comes from a theoretical artifact carrying the preferred main stat, four maximum rolls into a preferred substat, and three maximum rolls into acceptable substats. The preferred substat is worth 4 × 1 = 4 points, and with acceptable substats at the default 50 %, the three acceptable rolls are worth 3 × 0.5 = 1.5 points between them. Add the preferred main stat’s 2 points: <span className="math-equation-inline" aria-label="4 plus 1.5 plus 2 equals 7.5 points"><span>4</span><span aria-hidden="true">+</span><span>1.5</span><span aria-hidden="true">+</span><span>2</span><span aria-hidden="true">=</span><b className="type-body-emphasis">7.5 points</b></span>
        </p>

        <article className="math-example" aria-labelledby="artifact-math-example-title">
          <h3 id="artifact-math-example-title" className="type-heading">How it adds up</h3>
          <p>
            An attribute artifact, scored against <b className="type-body-emphasis">Brandia</b>, with a preferred ATK main stat, one preferred substat and three acceptable substats. Acceptable substats are left at the default 50 %.
          </p>
          <div className="math-table-scroll">
            <table className="math-table">
              <caption className="visually-hidden">
                Each substat of the example artifact with the value it rolled, the maximum roll of that substat, the number of maximum rolls the line amounts to, how those rolls are converted, and the points it earns
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="align-left">Substat</th>
                  <th scope="col">Max roll</th>
                  <th scope="col">No. of max rolls</th>
                  <th scope="col">Rank</th>
                  <th scope="col">Calculation</th>
                  <th scope="col">Points</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row" className="align-left">Additional Damage by ATK <span className="math-table-rolled">+ 12 %</span></th>
                  <td>4 %</td><td>3.00</td><td>Preferred</td><td>3.00 × 1 =</td><td>3.00</td>
                </tr>
                <tr>
                  <th scope="row" className="align-left">Damage Dealt on Wind <span className="math-table-rolled">+ 8 %</span></th>
                  <td>5 %</td><td>1.60</td><td>Acceptable</td><td>1.60 × 0.5 =</td><td>0.80</td>
                </tr>
                <tr>
                  <th scope="row" className="align-left">Own turn 1-target CRIT DMG <span className="math-table-rolled">+ 5 %</span></th>
                  <td>4 %</td><td>1.25</td><td>Acceptable</td><td>1.25 × 0.5 =</td><td>0.63</td>
                </tr>
                <tr>
                  <th scope="row" className="align-left">CRIT DMG as enemy HP is more <span className="math-table-rolled">+ 4 %</span></th>
                  <td>6 %</td><td>0.67</td><td>Acceptable</td><td>0.67 × 0.5 =</td><td>0.33</td>
                </tr>
                <tr>
                  <th scope="row" className="align-left">ATK main stat</th>
                  <td /><td /><td>Preferred</td><td /><td>2.00</td>
                </tr>
                <tr className="math-table-total">
                  <th scope="row" className="align-left">Total</th>
                  <td /><td /><td /><td /><td><b className="type-body-emphasis">6.76</b></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="math-equation" aria-label="Calculated score: 6.76 points divided by 7.5 points equals 90 percent">
            <span className="math-equation-label">Calculated score</span><span>6.76</span><span aria-hidden="true">/</span><span>7.5</span><span aria-hidden="true">=</span><b className="type-body-emphasis">90 %</b>
          </p>
        </article>
      </div>
    </Disclosure>

    <Disclosure title="Relic Optimization" sessionKey="the-math.relics">
      <div className="math-copy">
        <p className="lead">
          For each monster, JASWA scores every relic you own and names the best one. A relic’s score is two things multiplied: how <b className="type-body-emphasis">suitable</b> it is for that monster, and how far it has been <b className="type-body-emphasis">powered up</b>.
        </p>
        <p className="math-equation" aria-label="score equals fit times strength">
          <span className="math-equation-label">Score</span><span>fit</span><span aria-hidden="true">×</span><span>strength</span>
        </p>
        <p>
          They multiply rather than add, because a big number pointed at the wrong stat is worth nothing. A fully powered-up DEF relic on a pure attacker should not score well just for being fully powered up.
        </p>

        <h3 className="type-heading">Fit: is this the right relic?</h3>
        <p>
          A relic has a main stat and a unique property. JASWA asks three questions about them, and each is answered on a 0–1 scale.
        </p>
        <p>
          <b className="type-body-emphasis">Is this the main stat the monster wants?</b> and <b className="type-body-emphasis">is this the unique property it wants?</b> are answered from your own relic preferences for that monster: anything you picked scores 1, anything you did not scores almost nothing. Where you have not picked anything, JASWA falls back on the game’s own Relic Engraving Statistics panel — what other players actually put on that monster — and the most popular choice scores 1, with the rest scoring less the further behind they fall.
        </p>
        <p>
          The two questions are answered separately, so picking main stats for a monster and leaving its unique properties alone means your choice decides the first and the statistics still decide the second.
        </p>
        <p>
          <b className="type-body-emphasis">Do the two work well together?</b> is a fixed rating for every possible pairing, from Exceptional down to Poor. It is a judgement written into JASWA, not a statistic.
        </p>
        <p>
          The third question counts for half the fit, because it is the one that judges the relic as a whole:
        </p>
        <p className="math-equation" aria-label="fit equals 0.30 times main stat plus 0.20 times unique property plus 0.50 times pairing">
          <span className="math-equation-label">Fit</span><span>0.30 × main</span><span aria-hidden="true">+</span><span>0.20 × unique</span><span aria-hidden="true">+</span><span>0.50 × pairing</span>
        </p>

        <h3 className="type-heading">Strength: how much is it delivering?</h3>
        <p>
          Strength is how far the relic has come towards being fully powered up, on the same 0–1 scale. A relic at <span className="math-relic-level">+15</span> reads 1.00 — but that is the top of the scale rather than a realistic goal. The odds get worse every level, and a fresh relic finishes roughly once in eleven thousand tries, so the example below stops at <span className="math-relic-level">+12</span>.
        </p>

        <article className="math-example" aria-labelledby="relic-math-example-title">
          <h3 id="relic-math-example-title" className="type-heading">How it adds up</h3>
          <p>
            Two relics, judged for <b className="type-body-emphasis">Brandia</b>. Other players give Brandia an ATK main stat 81 % of the time, and Sharp Conquest is their most popular unique property. Relic A is exactly that — but barely powered up. Relic B has the wrong main stat, and is well on its way to finished.
          </p>
          <div className="math-table-scroll">
            <table className="math-table math-table-relics">
              <caption className="visually-hidden">
                Two relics scored for Brandia, showing how each one answers the three fit questions, the fit they combine into, its strength, and the final score
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="align-left">Relic</th>
                  <th scope="col">Main</th>
                  <th scope="col">Unique</th>
                  <th scope="col">Pairing</th>
                  <th scope="col">Fit</th>
                  <th scope="col">Strength</th>
                  <th scope="col">Score</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row" className="align-left">
                    Relic A <span className="math-table-rolled">ATK · Sharp Conquest · <span className="math-relic-level">+6</span></span>
                  </th>
                  <td>1.00</td><td>1.00</td><td>1.00</td><td>1.00</td><td>0.42</td>
                  <td>0.42</td>
                </tr>
                <tr>
                  <th scope="row" className="align-left">
                    Relic B <span className="math-table-rolled">HP · Nimble Primal · <span className="math-relic-level">+12</span></span>
                  </th>
                  <td>0.14</td><td>0.90</td><td>1.00</td><td>0.72</td><td>0.82</td>
                  <td><b className="type-body-emphasis">0.59</b></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Relic A is the perfect relic for Brandia, so its fit is a flat 1.00 — but at <span className="math-relic-level">+6</span> it is only delivering 42 % of what it eventually will. Relic B loses most of its main stat score, yet Nimble Primal is nearly as popular on Brandia as Sharp Conquest, and it pairs excellently with an HP main stat, so it still reaches a fit of 0.72:
          </p>
          <p className="math-equation" aria-label="0.30 times 0.14 plus 0.20 times 0.90 plus 0.50 times 1.00 equals 0.72 fit">
            <span className="math-equation-label">Relic B fit</span><span>0.30 × 0.14</span><span aria-hidden="true">+</span><span>0.20 × 0.90</span><span aria-hidden="true">+</span><span>0.50 × 1.00</span><span aria-hidden="true">=</span><b className="type-body-emphasis">0.72</b>
          </p>
          <p>
            <b className="type-body-emphasis">Relic B wins</b>, 0.59 against 0.42, and keeps winning until Relic A reaches <span className="math-relic-level">+10</span>. The perfect relic does not win just for being perfect — it has to be powered up far enough to actually deliver something first.
          </p>
        </article>

        <h3 className="type-heading">Two things that override the score</h3>
        <p>
          <b className="type-body-emphasis">A relic fits on 150 monsters at a time.</b> If the best one for a monster is already on 150 others, that monster gets the next best instead, and the page says so. It also counts how many of the current 150 suit it <i>worse</i> — so you can see when unengraving one of them is the better move.
        </p>
        <p>
          <b className="type-body-emphasis">Small upgrades are not worth the work.</b> A relic has to beat the one a monster already wears by at least 5 % before the page suggests swapping it.
        </p>
      </div>
    </Disclosure>

    <Disclosure title="Power up, Keep or Sell" sessionKey="the-math.relic-verdicts">
      <div className="math-copy">
        <p className="lead">
          The section above asks which relic a monster should wear. This one asks a different question about the same relics: of everything in your inventory, which deserve your <b className="type-body-emphasis">Relic Power-up Stones</b>, which are worth keeping as they are, and which should go.
        </p>
        <p>
          Every relic passes through three questions in order, and <b className="type-body-emphasis">the first one it fails is its answer</b>. Nothing further is asked. That order is the whole rule, and it exists so that a relic cannot be recommended for stones on one ground while failing on a more important one.
        </p>

        <h3 className="type-heading">1. Is this pairing worth owning at all?</h3>
        <p>
          A relic’s main stat and unique property are rated from Exceptional down to Poor — the same pairing judgement the section above uses. The <b className="type-body-emphasis">Power-up threshold</b> slider sets the weakest pairing you are willing to keep, and anything below it is sold.
        </p>
        <div className="math-table-scroll">
          <table className="math-table math-table-verdicts">
            <caption className="visually-hidden">
              The five slider settings, the weakest pairing each one keeps, and how promising an attempt has to look before it spends stones
            </caption>
            <thead>
              <tr>
                <th scope="col" className="align-left">Setting</th>
                <th scope="col" className="align-left">Keeps</th>
                <th scope="col" className="align-left">Spends stones when</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="align-left">Picky</th>
                <td className="align-left">Strong and better</td>
                <td className="align-left">the attempt is worth 1.2 ordinary levels</td>
              </tr>
              <tr>
                <th scope="row" className="align-left">Balanced</th>
                <td className="align-left">Neutral and better</td>
                <td className="align-left">it is worth 0.8</td>
              </tr>
              <tr>
                <th scope="row" className="align-left">Optimistic</th>
                <td className="align-left">Weak and better</td>
                <td className="align-left">it is worth 0.5</td>
              </tr>
              <tr>
                <th scope="row" className="align-left">Wishful thinking</th>
                <td className="align-left">everything</td>
                <td className="align-left">it is worth 0.35</td>
              </tr>
              <tr>
                <th scope="row" className="align-left">Burn it all</th>
                <td className="align-left">everything</td>
                <td className="align-left">it is worth 0.2</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          <b className="type-body-emphasis">Balanced is the ordinary setting</b>, and where the slider opens. Only one setting is stricter. The two boldest keep every pairing in the game and differ only in how freely they spend, and <b className="type-body-emphasis">Burn it all</b> is there to give the scale an end rather than because anyone should sit on it.
        </p>
        <p>
          This question is asked <i>first</i>, and that matters more than it sounds. A relic below <span className="math-relic-level">+3</span> is guaranteed to gain a level — but a guaranteed level on a pairing you have already rejected is a guaranteed waste of stones, so the pairing is settled before the guarantee is allowed to argue for itself.
        </p>

        <h3 className="type-heading">2. Do you already own a better copy of it?</h3>
        <p>
          Because one relic covers 150 monsters, a second copy of the same pairing is only worth anything if it can <i>overtake</i> the one you already have. So JASWA asks for the chance it ever passes that copy’s current level — and <b className="type-body-emphasis">the slider has no say here</b>. How freely you spend stones is a matter of taste; whether an attempt is already lost is not.
        </p>
        <p>
          How good that chance has to be depends on the pairing, because the pairing is what the attempt buys:
        </p>
        <div className="math-table-scroll">
          <table className="math-table math-table-verdicts math-table-overtake">
            <caption className="visually-hidden">
              For each pairing rating, the chance of overtaking that is required, and the highest level of existing copy a fresh relic will still be rolled against
            </caption>
            <thead>
              <tr>
                <th scope="col" className="align-left">Pairing</th>
                <th scope="col">Needs</th>
                <th scope="col" className="align-left">A fresh relic still tries against</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="align-left">Exceptional</th>
                <td>5 %</td>
                <td className="align-left">a <span className="math-relic-level">+9</span>, at 11 %</td>
              </tr>
              <tr>
                <th scope="row" className="align-left">Strong</th>
                <td>15 %</td>
                <td className="align-left">a <span className="math-relic-level">+8</span>, at 22 %</td>
              </tr>
              <tr>
                <th scope="row" className="align-left">Neutral</th>
                <td>30 %</td>
                <td className="align-left">a <span className="math-relic-level">+7</span>, at 40 %</td>
              </tr>
              <tr>
                <th scope="row" className="align-left">Weak</th>
                <td>50 %</td>
                <td className="align-left">a <span className="math-relic-level">+6</span>, at 61 %</td>
              </tr>
              <tr>
                <th scope="row" className="align-left">Poor</th>
                <td>70 %</td>
                <td className="align-left">a <span className="math-relic-level">+5</span>, at 82 %</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          In practice this sorts duplicates by how far the copy you own has already climbed. A fresh relic passes a <span className="math-relic-level">+5</span> 82 % of the time, a <span className="math-relic-level">+8</span> 22 %, a <span className="math-relic-level">+10</span> 4.3 % — and a <span className="math-relic-level">+12</span> just 0.4 %, or once in 280 attempts. <b className="type-body-emphasis">Even Exceptional gives up there.</b> No pairing is good enough to make that a plan.
        </p>
        <p>
          One exception: if the copy you own is already engraved on its full 150 monsters, it cannot take a 151st, so the duplicate is not redundant at all — it is the only way to put that pairing on another monster. It is then judged on its own merits, exactly as if you owned no copy.
        </p>

        <h3 className="type-heading">3. Is this attempt where the next stone should go?</h3>
        <p>
          Only relics that are worth owning and are not hopeless duplicates reach this question — and it is the only one the slider’s spending column decides. JASWA weighs what the next attempt is likely to gain against what it costs, measured in ordinary levels, and adjusted for how good the pairing is.
        </p>
        <p>
          The answer is <b className="type-body-emphasis">Power up</b> if it clears the bar and <b className="type-body-emphasis">Keep</b> if it does not. Keep is not a criticism: it means the relic is worth owning but your stones do better elsewhere right now.
        </p>
        <p>
          <b className="type-body-emphasis">Stones are worth far more on a low relic than a high one.</b> The published success rates are 100 % at <span className="math-relic-level">+0</span>, <span className="math-relic-level">+1</span> and <span className="math-relic-level">+2</span>, 80 % at <span className="math-relic-level">+3</span>, and fall to 10 % at <span className="math-relic-level">+14</span>. A fresh relic with all three durability comes to rest at <span className="math-relic-level">+7</span> or better about 61 % of the time, and finishes at <span className="math-relic-level">+15</span> roughly once in eleven thousand tries.
        </p>
        <p>
          Those first three levels are <b className="type-body-emphasis">certain, not free</b>: they cannot fail, so they cost no durability, but the game charges its usual stones and gold for each one.
        </p>

        <h3 className="type-heading">What the column actually shows</h3>
        <p>
          Every verdict prints the real game chance underneath it — <span className="math-table-rolled">Next +1: 60 %</span>, <span className="math-table-rolled">Beat +12: 4.8 %</span>, <span className="math-table-rolled">Sure +1: 100 %</span> — never the internal score. You get the chance of the thing you are about to do, not the arithmetic used to rank it. A relic rejected on its pairing says so by name: <span className="math-table-rolled">Weak fit: below threshold.</span>
        </p>
      </div>
    </Disclosure>
  </WorkspacePage>;
}
