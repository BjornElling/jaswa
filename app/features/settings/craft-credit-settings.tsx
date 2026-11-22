import { Disclosure } from '../../ui/page-chrome';
import { Dropdown } from '../../ui/dropdown';
import { SettingsCard } from './settings-card';
import { craftCreditGrades } from '../../domain/profiles/craft-credit-settings';
import {
  craftRollAssumptions, craftRollLabels, craftRoundingLabels, craftRoundings,
} from '../../domain/runes/craft/rune-craft-items';
import type { CraftRollAssumption, CraftRounding } from '../../domain/runes/craft/rune-craft-items';
import type { CraftAssumption, CraftCredit, CraftCreditGrade } from '../../domain/runes/craft/rune-craft-end-state';

const gradeLabel = (grade: CraftCreditGrade) => (grade === 'none' ? 'None' : grade);

/**
 * **The one Gem and Grindstone every rune judgement assumes**, chosen here and read
 * everywhere: Rune Clean-up's projection and its ruler, Gems & Grinds' premise and
 * Gem placement, the Rune Simulator, the rune overlay and Rune Optimization's
 * *Theoretical* items (`RunePotentialSettings.craftCredit`). A page that asks about
 * items the account actually holds keeps its own roll for those, because that is a
 * question about the box, not about what a rune could become.
 *
 * Changing a choice calculates nothing; every page whose answer read it says so when
 * it is next opened (`AGENTS.md` §5).
 */
export function CraftCreditSettings({ credit, onChange }: {
  credit: CraftCredit;
  onChange: (credit: CraftCredit) => void;
}) {
  return <Disclosure title="Gems & Grindstones" sessionKey="settings.craft-credit">
    <div className="stack">
      <p className="notice" role="note">
        This decides the Gem and Grindstone assumed when JASWA judges what any rune could
        become — in Rune Clean-up, Gems &amp; Grinds, the Rune Simulator, the rune overlay
        and Rune Optimization’s Theoretical items. A line that already rolled or was ground
        better keeps its own value. We recommend keeping the default: an average Legend
        roll, rounded up.
      </p>
      <div className="settings-pair">
        <CraftAssumptionCard title="Enchanted Gem" id="craft-credit-gem" assumption={credit.gem}
          onChange={(gem) => onChange({ ...credit, gem })} />
        <CraftAssumptionCard title="Grindstone" id="craft-credit-grind" assumption={credit.grind}
          onChange={(grind) => onChange({ ...credit, grind })} />
      </div>
    </div>
  </Disclosure>;
}

function CraftAssumptionCard({ title, id, assumption, onChange }: {
  title: string;
  id: string;
  assumption: CraftAssumption;
  onChange: (assumption: CraftAssumption) => void;
}) {
  /* None turns the kind off. The roll and rounding stay mounted and only disable,
     still showing what they hold, so the card keeps its shape (`AGENTS.md` §2) and
     choosing a grade again brings back what was chosen before. */
  const off = assumption.grade === 'none';
  return <SettingsCard title={title}>
    <div className="craft-credit-choices">
      <div className="filter-group">
        <label className="filter-label" htmlFor={`${id}-grade`}>Grade</label>
        <Dropdown id={`${id}-grade`} value={assumption.grade}
          onChange={(event) => onChange({ ...assumption, grade: event.target.value as CraftCreditGrade })}>
          {craftCreditGrades.map((grade) => <option key={grade} value={grade}>{gradeLabel(grade)}</option>)}
        </Dropdown>
      </div>
      <div className="filter-group" data-disabled={off ? 'true' : undefined}>
        <label className="filter-label" htmlFor={`${id}-roll`}>Roll</label>
        <Dropdown id={`${id}-roll`} value={assumption.roll} disabled={off}
          onChange={(event) => onChange({ ...assumption, roll: event.target.value as CraftRollAssumption })}>
          {craftRollAssumptions.map((roll) => <option key={roll} value={roll}>{craftRollLabels[roll]}</option>)}
        </Dropdown>
      </div>
      <div className="filter-group" data-disabled={off ? 'true' : undefined}>
        <label className="filter-label" htmlFor={`${id}-rounding`}>Rounded</label>
        <Dropdown id={`${id}-rounding`} value={assumption.rounding} disabled={off}
          onChange={(event) => onChange({ ...assumption, rounding: event.target.value as CraftRounding })}>
          {craftRoundings.map((rounding) => <option key={rounding} value={rounding}>{craftRoundingLabels[rounding]}</option>)}
        </Dropdown>
      </div>
    </div>
  </SettingsCard>;
}
