import { useState } from 'react';

/* A range input's thumb never reaches the very end of its track: the browser
   insets it by half its own width at each end, so a handle at the maximum has
   its centre half a thumb short of 100%. A value placed at a flat percentage of
   the track therefore drifts up to half a thumb away from the handle it names,
   worst at the two ends. Positions are expressed against the travel the thumb
   actually has, offset by half a thumb, so a value sits over its handle at
   every point of the range — including both ends. */
const sliderThumb = 16;
function handlePosition(fraction: number) {
  return `calc(${sliderThumb / 2}px + ${fraction} * (100% - ${sliderThumb}px))`;
}

/** The two ends of an interval, which are also the two stacked inputs. */
type RangeEnd = 'lower' | 'upper';

/** Which input a gesture is holding, and which end of the interval that input
    currently names. `holds` starts as the input's own end and flips when the
    handle is carried past its partner. */
type Grip = { input: RangeEnd; holds: RangeEnd };

const otherEnd = (end: RangeEnd): RangeEnd => end === 'lower' ? 'upper' : 'lower';

/**
 * A two-handle range, stated as the interval its two values name.
 *
 * The two handles are two stacked native range inputs, and the obvious way to
 * keep them in order is to clamp each against the other. That deadlocks. Drag
 * both to the top of the track and the upper input — which has to sit on top to
 * be reachable at all — refuses to go below the lower one sitting on the same
 * value, while the lower one is buried beneath it and cannot be grabbed. The
 * range is then stuck on that single value for good, and the same happens
 * wherever the two handles meet, the bottom of the track included.
 *
 * So neither handle is fenced in. Both move over the whole track, and which end
 * of the interval a handle names is simply which of the two values is the lower
 * one — a handle dragged past its partner takes over the other end rather than
 * stopping against it. The interval the user draws is the interval they get,
 * and no position the control can reach is a position it cannot leave.
 *
 * Two things then have to follow the gesture rather than being fixed, and both
 * are about which handle the pointer is holding:
 *
 * - **Which value each input carries.** Ordering the pair is not enough on its
 *   own: the moment a handle crosses its partner, the input under the pointer
 *   is handed the value it just left behind, and the drag carries on moving the
 *   *other* end — so pulling the upper handle down past the lower one drags
 *   them both down together instead of leaving one behind. `grip` remembers
 *   which end the held input is naming, so the handle the user grabbed keeps
 *   following the pointer and its partner stays where it stood.
 * - **Which input is on top.** Coincident handles leave only the upper one
 *   hittable, and at the top of the track that is the one with nowhere to go,
 *   so the end that keeps the top is the end that can still move. During a
 *   gesture the held input keeps the top regardless, or a handle catching up
 *   with its partner would be swapped out from under the drag.
 */
export function RangeSlider({
  minimum, maximum, lowerValue, upperValue, step = 1, label, valueText,
  lowerLabel, upperLabel, onChange,
}: {
  /** The lowest value either handle can take. */
  minimum: number;
  /** The highest value either handle can take. */
  maximum: number;
  lowerValue: number;
  upperValue: number;
  step?: number;
  /** Names the control as a whole. */
  label: string;
  /** How one endpoint reads aloud, e.g. `Minimum level 12`. */
  valueText: (value: number, end: RangeEnd) => string;
  lowerLabel: string;
  upperLabel: string;
  /** Always called with the interval in order, whichever handle moved. */
  onChange: (lower: number, upper: number) => void;
}) {
  /* Which input a gesture holds, and nothing more: the interval itself stays
     where the page keeps it, so a drag never leaves a second copy behind. */
  const [grip, setGrip] = useState<Grip | null>(null);

  const span = maximum - minimum;
  const fraction = (value: number) => span === 0 ? 0 : (value - minimum) / span;
  const lowerPosition = handlePosition(fraction(lowerValue));
  const upperPosition = handlePosition(fraction(upperValue));

  const endValue = (end: RangeEnd) => end === 'lower' ? lowerValue : upperValue;
  /* Between gestures each input names its own end, which is what puts every
     thumb where its value reads. A held input names whichever end it was last
     dragged to, and its partner takes the one left over. */
  const namedEnd = (input: RangeEnd): RangeEnd => grip === null
    ? input
    : grip.input === input ? grip.holds : otherEnd(grip.holds);

  /* The handles coincide only where the two values are equal, and there the
     pointer must reach the one that is not pinned against an end of the
     track. */
  const topInput: RangeEnd = grip?.input
    ?? (lowerValue === upperValue && lowerValue >= maximum ? 'lower' : 'upper');

  const handle = (input: RangeEnd) => {
    const end = namedEnd(input);
    const value = endValue(end);
    const partner = endValue(otherEnd(end));
    /* A gesture ends wherever the pointer is released, including off the track,
       so losing the pointer and losing focus both close the grip: an input must
       not still be naming the interval's far end when the next one starts. */
    const release = () => setGrip(null);
    return <input
      className={`range-slider-input range-slider-input-${input}${topInput === input ? ' range-slider-input-top' : ''}`}
      type="range" min={minimum} max={maximum} step={step} value={value}
      onChange={(event) => {
        const moved = Number(event.target.value);
        setGrip({ input, holds: moved > partner ? 'upper' : 'lower' });
        onChange(Math.min(moved, partner), Math.max(moved, partner));
      }}
      onPointerDown={release}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onBlur={release}
      aria-label={end === 'lower' ? lowerLabel : upperLabel}
      aria-valuetext={valueText(value, end)} />;
  };

  return <div className="range-slider" aria-label={label}>
    <div className="range-slider-values" aria-hidden="true">
      <output className="range-slider-value" style={{ left: lowerPosition }}>{lowerValue}</output>
      <output className="range-slider-value" style={{ left: upperPosition }}>{upperValue}</output>
    </div>
    <div className="range-slider-track">
      <span className="range-slider-fill" style={{ left: lowerPosition, right: `calc(100% - ${upperPosition})` }} />
      {handle('lower')}
      {handle('upper')}
    </div>
  </div>;
}

/**
 * A one-handle slider in the same component shape as the two-handle range, so
 * a filter strip reads one control whether it names a point or an interval.
 * The value hangs below the rail rather than above it: above, it stood between
 * the control and the line before it and opened a gap its neighbours in the
 * same group did not have.
 *
 * `valueLabel` names each stop in words, for a scale whose numbers mean nothing
 * to the reader. A name is far wider than a digit, so it stays centred under the
 * rail rather than riding the handle: carried to the ends, a name long enough to
 * be worth showing hangs off the row it sits in, and shifting it back inside
 * would put it beside a handle it no longer points at.
 *
 * `valueAbove` puts the value over the rail instead, in the range slider's own
 * row and following the handle, for a slider standing in one strip row with a
 * two-handle range: there the two rails and their values have to sit at one
 * height, and the gap that led to the default is the gap the range already
 * opens.
 */
export function ValueSlider({
  minimum, maximum, value, step = 1, label, valueText, valueLabel, valueAbove = false, disabled, onChange,
}: {
  minimum: number;
  maximum: number;
  value: number;
  step?: number;
  label: string;
  valueText: (value: number) => string;
  /** The stop's name, shown under the rail in place of the number. */
  valueLabel?: (value: number) => string;
  /** Over the rail, aligned with a two-handle range beside it. */
  valueAbove?: boolean;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const span = maximum - minimum;
  const fraction = span === 0 ? 0 : (value - minimum) / span;
  const position = handlePosition(fraction);
  /* Above the rail a name rides its handle, as a range's figures do. Its anchor
     slides from its left edge at the first stop to its right edge at the last,
     so the name stays over the handle and never hangs past either end. */
  const values = valueLabel && valueAbove
    ? <div className="range-slider-values" aria-hidden="true">
      <output className="range-slider-value"
        style={{ left: position, transform: `translateX(-${fraction * 100}%)` }}>{valueLabel(value)}</output>
    </div>
    : valueLabel
    ? <div className="range-slider-values range-slider-named" aria-hidden="true">
      <output className="range-slider-value">{valueLabel(value)}</output>
    </div>
    : <div className="range-slider-values" aria-hidden="true">
      <output className="range-slider-value" style={{ left: position }}>{value}</output>
    </div>;
  return <div className={`range-slider range-slider-single${valueAbove ? ' range-slider-value-above' : ''}`}
    data-disabled={disabled ? 'true' : undefined}>
    {valueAbove && values}
    <div className="range-slider-track">
      <input className="range-slider-input" type="range" min={minimum} max={maximum} step={step} value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label} aria-valuetext={valueText(value)} />
    </div>
    {!valueAbove && values}
  </div>;
}
