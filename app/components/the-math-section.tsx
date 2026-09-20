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
          For every rune you own, JASWA answers one question: <b className="type-body-emphasis">Power up</b>, <b className="type-body-emphasis">Keep</b>, or <b className="type-body-emphasis">Sell</b>. The answer rests on two numbers, and a rune has to satisfy both. <b className="type-body-emphasis">Max value</b> is the best this rune could ever become. <b className="type-body-emphasis">Chance</b> is how likely it is to actually get there.
        </p>
        <p>
          Every rune you own is judged — the ones on your monsters and the ones already at +12 along with the rest. Nothing in Settings narrows that, because a preset&rsquo;s share is finite: a rune held back from the calculation would hand its place to the runes that remain and change their answers. What the table <i>shows</i> is a separate matter, and the filters above it move no figure at all.
        </p>
        <p>
          A rune that could be wonderful but almost certainly will not be is not worth your mana. Neither is a rune that is certain to reach a ceiling that is too low. Both have to clear their bar.
        </p>

        <h3 className="type-heading">One yardstick: the best possible roll</h3>
        <p>
          Runes speak in mixed units. Is <span className="math-table-rolled">ATK +20</span> better than <span className="math-table-rolled">ATK +8 %</span>? It depends entirely on the monster. So everything — what a role needs and what a rune brings — is first converted into the same yardstick: <b className="type-body-emphasis">how much of one best possible roll it is worth</b>.
        </p>
        <p>
          A percentage substat is easy, because the best possible roll is itself a percentage. A flat substat is first compared with what a typical monster of that kind actually has.
        </p>
        <div className="math-table-scroll">
          <table className="math-table">
            <caption className="visually-hidden">
              How a flat substat and a percentage substat are converted to the same yardstick
            </caption>
            <thead>
              <tr>
                <th scope="col" className="align-left">Substat</th>
                <th scope="col" className="align-left">Against a base ATK of 808</th>
                <th scope="col">Best possible roll</th>
                <th scope="col">Worth</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="align-left">ATK <span className="math-table-rolled">+ 8 %</span></th>
                <td className="align-left">already 8 %</td><td>8 %</td><td>1.00</td>
              </tr>
              <tr>
                <th scope="row" className="align-left">ATK <span className="math-table-rolled">+ 20</span></th>
                <td className="align-left">20 ÷ 808 = 2.5 %</td><td>8 %</td><td>0.31</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          So a maximum flat ATK roll is worth about a third of a maximum percentage roll. That is not a rule someone typed in — it falls out of the division, and it changes with the monster family, because a flat 20 means more to a weak attacker than to a strong one.
        </p>

        <h3 className="type-heading">What your monsters actually bring</h3>
        <p>
          Every preset names a family: Attack, Support, Defence, HP, or no type at all. JASWA averages the base stats of <i>your own</i> level 40 monsters of that family, and that average is what a target is measured against. An account of maxed nat-5s and an account of freshly-sixed farmables are asking their runes for different things, and a number shipped with the app would tell them both the same story.
        </p>
        <p>
          If you have no level 40 monster of a family, the whole roster stands in. If you have none at all, the page says it cannot judge runes yet rather than inventing a monster.
        </p>

        <h3 className="type-heading">A target is not a switch</h3>
        <p>
          Here is where JASWA stopped agreeing with most rune tools. Fast DD wants <span className="math-table-rolled">215 SPD</span> and <span className="math-table-rolled">25 Accuracy</span>. Treating both as simply &ldquo;wanted&rdquo; makes a maximum Accuracy roll worth exactly as much as a maximum SPD roll — and that is plainly wrong, because those two targets are not asking the runes for remotely the same thing.
        </p>
        <p>
          So every target earns its own <b className="type-body-emphasis">weight</b>, worked out in four steps.
        </p>
        <div className="math-table-scroll">
          <table className="math-table math-table-verdicts">
            <caption className="visually-hidden">The four steps that turn a preset target into a weight</caption>
            <thead>
              <tr>
                <th scope="col" className="align-left">Step</th>
                <th scope="col" className="align-left">What it asks</th>
                <th scope="col" className="align-left">Why</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="align-left">1. Subtract</th>
                <td className="align-left">What do the monster, the six main stats and the completed set already bring?</td>
                <td className="align-left">A Fast DD build carries ATK % in two slots and an ATK main in slot 1. Most of its ATK target is already paid for.</td>
              </tr>
              <tr>
                <th scope="row" className="align-left">2. Convert</th>
                <td className="align-left">How many maximum rolls is the rest?</td>
                <td className="align-left">The same yardstick as everything else, so SPD points and HP points become comparable.</td>
              </tr>
              <tr>
                <th scope="row" className="align-left">3. Share it out</th>
                <td className="align-left">How much must <i>one</i> rune find, across the slots that may legally carry it?</td>
                <td className="align-left">A stat the slot&rsquo;s own main stat blocks cannot be carried there, so the other slots have to find it.</td>
              </tr>
              <tr>
                <th scope="row" className="align-left">4. Compare</th>
                <td className="align-left">How much does an ordinary rune give you anyway?</td>
                <td className="align-left">A share four times what runes ordinarily supply takes four times the hunting. That ratio <i>is</i> the weight.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Worked through for <b className="type-body-emphasis">Fast DD</b>, on a Violent rune, against an attack-type monster with 9,708 HP, 808 ATK, 568 DEF and 105 SPD:
        </p>
        <div className="math-table-scroll">
          <table className="math-table math-table-weights">
            <caption className="visually-hidden">
              For each Fast DD target: what it wants, what the build already brings, what is still missing in maximum rolls, the share one rune must find, what an ordinary rune supplies, and the resulting weight
            </caption>
            <thead>
              <tr>
                <th scope="col" className="align-left">Target</th>
                <th scope="col">Wants</th>
                <th scope="col">Already there</th>
                <th scope="col">Still missing</th>
                <th scope="col">Per rune</th>
                <th scope="col">Ordinary rune</th>
                <th scope="col">Weight</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="align-left">SPD</th>
                <td>215</td><td>105</td><td>18.3 rolls</td><td>3.06</td><td>0.72</td>
                <td><b className="type-body-emphasis">1.00</b></td>
              </tr>
              <tr>
                <th scope="row" className="align-left">ATK</th>
                <td>2,500</td><td>1,986</td><td>8.0 rolls</td><td>1.59</td><td>0.57</td>
                <td><b className="type-body-emphasis">0.66</b></td>
              </tr>
              <tr>
                <th scope="row" className="align-left">CRI Rate</th>
                <td>90</td><td>18</td><td>12.0 rolls</td><td>2.00</td><td>0.72</td>
                <td><b className="type-body-emphasis">0.66</b></td>
              </tr>
              <tr>
                <th scope="row" className="align-left">CRI Dmg</th>
                <td>175</td><td>130</td><td>6.4 rolls</td><td>1.29</td><td>0.69</td>
                <td><b className="type-body-emphasis">0.44</b></td>
              </tr>
              <tr>
                <th scope="row" className="align-left">Accuracy</th>
                <td>25</td><td>4</td><td>2.6 rolls</td><td>0.44</td><td>0.65</td>
                <td><b className="type-body-emphasis">0.16</b></td>
              </tr>
              <tr>
                <th scope="row" className="align-left">HP</th>
                <td>15,042</td><td>12,156</td><td>3.7 rolls</td><td>0.62</td><td>0.94</td>
                <td><b className="type-body-emphasis">0.16</b></td>
              </tr>
              <tr>
                <th scope="row" className="align-left">DEF</th>
                <td>814</td><td>728</td><td>1.9 rolls</td><td>0.38</td><td>0.89</td>
                <td><b className="type-body-emphasis">0.10</b></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          A maximum CRI Dmg roll is now worth <b className="type-body-emphasis">2.8 maximum Accuracy rolls</b> to this role, and a maximum SPD roll <b className="type-body-emphasis">6.3</b> of them. The weights are scaled so the hardest target weighs exactly 1; nothing depends on that choice except readability.
        </p>
        <p>
          Two consequences worth spelling out. <b className="type-body-emphasis">A target the build already meets asks the runes for nothing</b> — Leo wants 100 SPD and the reference monster already has 104, so SPD lines earn Leo nothing. And <b className="type-body-emphasis">the set matters</b>: a Fatal rune brings +35 % ATK with it, which finds 283 of Fast DD&rsquo;s missing 514 ATK, so the ATK weight on a Fatal rune drops from 0.66 to 0.30.
        </p>
        <p>
          What a target never does is <i>cap</i> anything. A rune that rolled past its share is worth more, not the same — the surplus is exactly what lets another rune in the finished build carry the HP or the Accuracy instead.
        </p>

        <h3 className="type-heading">What a perfect rune looks like</h3>
        <p>
          100 % is a real rune, not a formula. It is the best one the game could legally produce for this role in this slot: four substats at their maximum, <b className="type-body-emphasis">the most valuable of them carrying all four later upgrades as well</b>, and an innate property at the maximum of the next best stat. Nine rolls, five different substats.
        </p>
        <p>
          For a slot 2 rune with an ATK % main stat — which means ATK % itself cannot appear as a substat — Fast DD&rsquo;s perfect rune is:
        </p>
        <div className="math-table-scroll">
          <table className="math-table">
            <caption className="visually-hidden">
              The five lines of the perfect Fast DD slot 2 rune, with the worth of one maximum roll of each and its contribution
            </caption>
            <thead>
              <tr>
                <th scope="col" className="align-left">Line</th>
                <th scope="col">Maximum</th>
                <th scope="col">One max roll is worth</th>
                <th scope="col">Contribution</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="align-left">SPD <span className="math-table-rolled">× 5 rolls</span></th>
                <td>6</td><td>1.000</td><td>5.000</td>
              </tr>
              <tr>
                <th scope="row" className="align-left">CRI Rate</th>
                <td>6</td><td>0.655</td><td>0.655</td>
              </tr>
              <tr>
                <th scope="row" className="align-left">CRI Dmg</th>
                <td>7</td><td>0.440</td><td>0.440</td>
              </tr>
              <tr>
                <th scope="row" className="align-left">ATK <span className="math-table-rolled">+ flat</span></th>
                <td>20</td><td>0.204</td><td>0.204</td>
              </tr>
              <tr>
                <th scope="row" className="align-left">Accuracy <span className="math-table-rolled">innate</span></th>
                <td>8</td><td>0.159</td><td>0.159</td>
              </tr>
              <tr className="math-table-total">
                <th scope="row" className="align-left">100 %</th>
                <td /><td /><td><b className="type-body-emphasis">6.46</b></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Note the flat ATK line. ATK is a stat this role badly wants, but on this rune it can only arrive as a flat roll — and a flat roll is worth 0.31 of a percentage roll against an 808 base. The weight says the role wants ATK; the yardstick says this line cannot deliver much of it. Both are true, and they are kept separate.
        </p>

        <h3 className="type-heading">Scoring one rune</h3>
        <p>
          Now the rune itself: every line, the innate included, converted to maximum rolls and multiplied by its weight. Nothing is capped and nothing is thrown away.
        </p>
        <article className="math-example" aria-labelledby="rune-math-example-title">
          <h3 id="rune-math-example-title" className="type-heading">How it adds up</h3>
          <p>
            A <span className="math-table-rolled">+12</span> Violent slot 2 rune with an ATK % main stat, judged for Fast DD.
          </p>
          <div className="math-table-scroll">
            <table className="math-table">
              <caption className="visually-hidden">
                Each line of the example rune with what it rolled, how many maximum rolls that is, the weight of that stat, and the score it earns
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="align-left">Line</th>
                  <th scope="col">Max rolls</th>
                  <th scope="col">Weight</th>
                  <th scope="col">Score</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row" className="align-left">SPD <span className="math-table-rolled">+ 17</span></th>
                  <td>2.83</td><td>1.000</td><td>2.833</td>
                </tr>
                <tr>
                  <th scope="row" className="align-left">CRI Rate <span className="math-table-rolled">+ 5</span></th>
                  <td>0.83</td><td>0.655</td><td>0.545</td>
                </tr>
                <tr>
                  <th scope="row" className="align-left">CRI Dmg <span className="math-table-rolled">+ 6 innate</span></th>
                  <td>0.86</td><td>0.440</td><td>0.377</td>
                </tr>
                <tr>
                  <th scope="row" className="align-left">Accuracy <span className="math-table-rolled">+ 7</span></th>
                  <td>0.88</td><td>0.159</td><td>0.139</td>
                </tr>
                <tr>
                  <th scope="row" className="align-left">HP <span className="math-table-rolled">+ 6 %</span></th>
                  <td>0.75</td><td>0.155</td><td>0.116</td>
                </tr>
                <tr className="math-table-total">
                  <th scope="row" className="align-left">Total</th>
                  <td /><td /><td><b className="type-body-emphasis">4.01</b></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="math-equation" aria-label="Max value: 4.01 divided by 6.46 equals 62 percent">
            <span className="math-equation-label">Max value</span><span>4.01</span><span aria-hidden="true">/</span><span>6.46</span><span aria-hidden="true">=</span><b className="type-body-emphasis">62 %</b>
          </p>
          <p>
            The Accuracy line rolled near its maximum and still earns 0.139, while a slightly-above-average SPD line earns twenty times that. That is the whole point: the rune is good <i>because</i> of what it rolled into, not because it rolled into four things the preset happens to mention.
          </p>
        </article>

        <h3 className="type-heading">Runes that are not finished yet</h3>
        <p>
          Max value is what a rune <i>can become</i>, so an unfinished rune is projected forward first. A rune gains a substat at <span className="math-relic-level">+3</span>, <span className="math-relic-level">+6</span>, <span className="math-relic-level">+9</span> and <span className="math-relic-level">+12</span>, filling its four lines before improving them — never at <span className="math-relic-level">+15</span>, which only grows the main stat.
        </p>
        <p>
          Take the same rune at <span className="math-relic-level">+6</span>, before it drew its HP line. Two events are left: one new line, and one upgrade.
        </p>
        <div className="math-table-scroll">
          <table className="math-table math-table-verdicts">
            <caption className="visually-hidden">
              How the best possible end state of a plus six rune is built up from what it has and the events it has left
            </caption>
            <thead>
              <tr>
                <th scope="col" className="align-left">Step</th>
                <th scope="col" className="align-left">What the projection allows</th>
                <th scope="col">Score</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="align-left">What it has</th>
                <td className="align-left">SPD <span className="math-table-rolled">+ 17</span>, CRI Rate <span className="math-table-rolled">+ 5</span>, Accuracy <span className="math-table-rolled">+ 7</span>, CRI Dmg innate</td>
                <td>3.90</td>
              </tr>
              <tr>
                <th scope="row" className="align-left">One new line</th>
                <td className="align-left">The best substat still legal here — flat ATK, at its maximum</td>
                <td>+ 0.20</td>
              </tr>
              <tr>
                <th scope="row" className="align-left">One upgrade</th>
                <td className="align-left">Landing on SPD, at its maximum</td>
                <td>+ 1.00</td>
              </tr>
              <tr className="math-table-total">
                <th scope="row" className="align-left">Best it can become</th>
                <td className="align-left">5.10 against the same 6.46</td>
                <td><b className="type-body-emphasis">79 %</b></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          The new line has to be one the game would actually allow: not the main stat, not the innate, not a line the rune already carries, and legal in that slot. That restriction is the reason a rune with four useless lines and no additions left cannot improve, however much the role wants something else.
        </p>

        <h3 className="type-heading">One scale across star classes</h3>
        <p>
          A 4★ or 5★ rune is judged in the same currency, using <i>its own</i> verified substat ranges, and its main stat is scaled by how far that star class can grow it. The denominator never changes — it stays the perfect six-star rune — so lower star classes read lower on one shared scale instead of each reading 100 % on a scale of its own.
        </p>
        <div className="math-table-scroll">
          <table className="math-table">
            <caption className="visually-hidden">
              The same perfect Fast DD slot 2 rune at four, five and six stars, with its substat score, main stat factor and Max value
            </caption>
            <thead>
              <tr>
                <th scope="col" className="align-left">A perfect rune at</th>
                <th scope="col">Substat score</th>
                <th scope="col">Main stat factor</th>
                <th scope="col">Max value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="align-left">4★</th>
                <td>4.30</td><td>0.68</td><td>45 %</td>
              </tr>
              <tr>
                <th scope="row" className="align-left">5★</th>
                <td>5.38</td><td>0.81</td><td>67 %</td>
              </tr>
              <tr>
                <th scope="row" className="align-left">6★</th>
                <td>6.46</td><td>1.00</td><td><b className="type-body-emphasis">100 %</b></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Ancient runes use their higher verified <i>initial</i> substat interval for the lines they dropped with. Their later <span className="math-relic-level">+3</span>/<span className="math-relic-level">+6</span>/<span className="math-relic-level">+9</span>/<span className="math-relic-level">+12</span> upgrades, their added lines and their main stats follow the ordinary six-star rules, and they take Ancient craft items only.
        </p>

        <h3 className="type-heading">Gems and Grindstones</h3>
        <p>
          If you tell JASWA in Settings which Gems and Grindstones to assume, they are spent on the rune <i>and</i> on the perfect rune it is measured against. Turning a slider up raises the bar as well as the rune, so nothing can read past 100 % because the settings promised it a stone.
        </p>
        <p>
          A Grindstone is credited on every grindable line, including ones the rune has yet to gain, as <b className="type-body-emphasis">the better of what is already there and what the stone would give</b> — never added on top, which would pay the rune twice for one line.
        </p>
        <p>
          A Gem is different, because it is spent at <span className="math-relic-level">+12</span> and <b className="type-body-emphasis">throws away every roll its line collected on the way</b>. So the line it lands on is reserved: it is worth exactly the Gem, and the upgrades that fall on it are simply lost. Below <span className="math-relic-level">+12</span> the Gem is only ever projected onto a line the rune already has — a line it has not drawn yet cannot be planned around.
        </p>

        <h3 className="type-heading">The number the column prints</h3>
        <p>
          The Max value shown is the score the verdict uses. The quality floor is exactly the floor you set, so a number can be read directly without a hidden per-slot or per-preset multiplier.
        </p>
        <p>
          A preset describes a <i>family</i> of builds, not one build, and the main stats of the other five slots change what a rune is worth — a build with HP % in slots 4 and 6 asks its runes for thousands less HP than one with ATK % there. So every compatible build is scored and the rune keeps its best.
        </p>
        <p>
          That reads optimistically, and deliberately so: a rune with one excellent line will find the build whose other targets its main stats already cover, because that is the build where its one line counts for most. A PvP def rune carrying HP % and little else reaches 89 % against a DEF % / DEF % build and 77 % against an HP % / HP % one. Both are true of the build they describe, and your preset says it will take either.
        </p>

        <h3 className="type-heading">Chance: will it actually get there?</h3>
        <p>
          A rune below <span className="math-relic-level">+12</span> has upgrades still to come, and where they land is luck. A rune gains a substat roll at <span className="math-relic-level">+3</span>, <span className="math-relic-level">+6</span>, <span className="math-relic-level">+9</span> and <span className="math-relic-level">+12</span> — never at <span className="math-relic-level">+15</span>, which only improves the main stat.
        </p>
        <p>
          JASWA lists every way those remaining upgrades can fall — which line each one lands on, and how big it rolls — and adds up the chances of the paths that reach the bar. There are at most four upgrades and at most four lines, so this is counted exactly rather than guessed at or simulated. The same rune always prints the same number.
        </p>
        <p>
          A future line is drawn without replacement from the legal missing effect ids; after all new lines exist, each remaining upgrade is allocated to one of the four lines. Every realised roll contributes in full, weighted by its stat — including surplus SPD or Accuracy. The paths are counted separately because their legal lines and roll ranges differ, not because a stat is locally capped.
        </p>
        <p>
          Our <span className="math-relic-level">+6</span> rune above needs 79 % at its ceiling, but it only gets there if the one upgrade left lands on SPD and rolls well. At the strictest quality floor its chance of clearing the bar is <span className="math-table-rolled">75 %</span>; at the four looser floors it is already certain.
        </p>

        <h3 className="type-heading">What is measured and what is assumed</h3>
        <p>
          JASWA distinguishes the two, because a model that hides its assumptions is one you cannot argue with.
        </p>
        <div className="math-table-scroll">
          <table className="math-table">
            <caption className="visually-hidden">
              Which parts of the roll mechanic are measured from real data and which are assumed
            </caption>
            <thead>
              <tr>
                <th scope="col" className="align-left">Question</th>
                <th scope="col" className="align-left">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="align-left">How big is a roll?</th>
                <td className="align-left"><b className="type-body-emphasis">Measured.</b> Every value in the range is equally likely, confirmed on 1,530 innate properties from a real account.</td>
              </tr>
              <tr>
                <th scope="row" className="align-left">What are the ranges?</th>
                <td className="align-left"><b className="type-body-emphasis">Measured.</b> HP %, ATK % and DEF % roll 5–8 on a 6★ rune, not 4–8 as commonly listed.</td>
              </tr>
              <tr>
                <th scope="row" className="align-left">Which line does an upgrade improve?</th>
                <td className="align-left"><b className="type-body-emphasis">Assumed</b> to be an even 1-in-4. Com2uS has never published it and no datamine settles it.</td>
              </tr>
              <tr>
                <th scope="row" className="align-left">Which stat does a new line take?</th>
                <td className="align-left"><b className="type-body-emphasis">Assumed</b> even across the legal stats. The belief that SPD is rarer is widespread but unproven.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Those last two cannot be settled from your own box, however large it is: the runes you still own are the ones you chose to keep, and that choice contaminates every count. It is why the SPD figures in a rune collection always look stranger than the game actually is.
        </p>

        <h3 className="type-heading">The sliders, and how many runes survive</h3>
        <p>
          <b className="type-body-emphasis">Rune quality floor</b> sets the Max value bar. Its five stops are calibrated against a box of ordinary six-star runes: the setting it opens on passes about <b className="type-body-emphasis">15 %</b> of such a box, and the ladder runs from roughly a third of the box down to a few per cent. <b className="type-body-emphasis">Power-up policy</b> sets the Chance bar. <b className="type-body-emphasis">Accepted</b> and <b className="type-body-emphasis">Broken runes</b> discount a rune whose set or main stat the preset only tolerates, or never asked for — and at <i>No</i>, a broken rune is rejected outright whatever else is true of it.
        </p>
        <p>
          A preset&rsquo;s <b className="type-body-emphasis">Desired no. of runes</b> is a real allocation preference. After quality and chance gates, JASWA divides the finite eligible pool between active presets in those relative shares. A broad preset cannot take a narrow preset&rsquo;s allocation merely because more runes happen to match it. The larger-set switch and Intangible slider prioritise those matching runes when a quota is filled.
        </p>

        <h3 className="type-heading">The verdict</h3>
        <p>
          Every rune passes through these in order, and <b className="type-body-emphasis">the first one it fails is its answer</b>.
        </p>
        <div className="math-table-scroll">
          <table className="math-table math-table-verdicts">
            <caption className="visually-hidden">The order the gates are applied and the verdict each produces</caption>
            <thead>
              <tr>
                <th scope="col" className="align-left">Question</th>
                <th scope="col" className="align-left">If it fails</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="align-left">Is this a kind of rune you want at all?</th>
                <td className="align-left"><b className="type-body-emphasis">Sell</b> — broken, and you set Broken runes to No</td>
              </tr>
              <tr>
                <th scope="row" className="align-left">Can it ever be good enough?</th>
                <td className="align-left"><b className="type-body-emphasis">Sell</b> — Max value below the floor</td>
              </tr>
              <tr>
                <th scope="row" className="align-left">Is it likely enough to get there?</th>
                <td className="align-left"><b className="type-body-emphasis">Sell</b> — Chance below your policy</td>
              </tr>
              <tr className="math-table-total">
                <th scope="row" className="align-left">It passed everything</th>
                <td className="align-left"><b className="type-body-emphasis">Power up</b> below <span className="math-relic-level">+12</span>, <b className="type-body-emphasis">Keep</b> at <span className="math-relic-level">+12</span> or above</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          A rune is checked against <i>every</i> preset and every compatible main-stat choice. Passing candidates are then assigned once to the finite preset capacity you asked for. A rune that passed its own quality and Chance gates but is outside that capacity says so plainly instead of masquerading as a weak roll.
        </p>
        <p>
          Every star class is rated. A 4★ or 5★ rune uses its own main and substat intervals on the shared 6★ scale. An Ancient rune uses its higher verified interval only for substats it had on drop; its main stat, added lines and later upgrades use the ordinary 6★ intervals. Ancient Gems and Grindstones use their own legal tables.
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
