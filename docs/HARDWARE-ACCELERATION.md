# Hardware acceleration — where a calculation runs

**Status:** Binding contract for every accelerated calculation
**Reviewed:** 23 September 2026

One rule, for the whole program: **heavy work goes to the graphics card unless the
user switched it off or the card refused.** This document says what "heavy work"
means, how a calculation states its two halves, and what a calculation may not do.

`app/lib/compute/accelerated-calculation.ts` is the rule. `app/lib/compute/gpu/`
is the plumbing. `app/lib/hardware-acceleration.ts` is the detection the Home page
shows, and it is display only — it never gates anything.

---

## 1. Three states, not two

| State | What it means | Who decided |
| --- | --- | --- |
| **Off** | The user unticked *Use the graphics card for heavy calculations* | The user |
| **Refused** | No WebGPU, no adapter, a rejected pass, a lost device, a failed agreement check | The card |
| **On** | Neither of the above | — |

Only the third uses the card. Collapsing the first two would make the setting a hint;
collapsing the last two would make a driver problem look like a preference.

**A fall back is never silent.** Every calculation reports which engine answered, and
the status line under its results says `Graphics card` or `Processor` — or
`Graphics card + processor`, where one calculation answered in several passes and the
card took some of them and refused the rest. That is the
difference between "your card is working" and "your card is listed and doing nothing",
and it is the only signal a user has — the Home page's *Connected* box asks the browser
a different question than the worker does, and the two can disagree.

## 2. What a calculation states

```ts
type AcceleratedCalculation<TRequest, TResult> = {
  name: string;
  cpu(request): TResult;                    // the reference
  gpu?(request, context): Promise<TResult>; // the card's version, where one exists
  agrees?(context): Promise<boolean>;       // must it prove itself first
};
```

Two halves and a proof. **The processor's version is the reference**, always: it is
what the verification scripts run, what a fresh checkout runs, and what the card is
held to. A calculation without a `gpu` half is not broken — it is one nobody has had
reason to move yet.

**The card is offered whole questions, never decisions.** Thresholds, policy, gates,
tie-breaks and anything a verdict turns on stay on the processor, so an answer cannot
depend on where it was computed. What goes to the card is arithmetic with one number
coming back.

## 3. The bargain about second implementations

`AGENTS.md` §6 is firmly against two implementations of one calculation, and a shader
is exactly that. The bargain is **`agrees`**: a card backend may hand over a small
battery of cases whose answers the processor already knows, and a card that gets one of
them wrong is not used at all. It runs once per worker, costs milliseconds, and turns
the failure mode from *wrong numbers on screen* into *the status line says Processor*.

A calculation that declines to state one is taking its card on faith. That is a
decision to make deliberately and write down, not a default.

**The tolerance is not always zero.** A card works in single precision and the
processor in double. Where that can move an answer, the backend says by how much and
why, and the gate allows exactly that and no more.

## 4. What WebGPU will not tell you

Four failures, and only two of them announce themselves.

- **A shader that will not compile** rejects the pipeline. Caught.
- **A pass WebGPU rejects** does not throw. It drops the commands and leaves the output
  buffer as it was created, so the answer reads back as a block of zeros — which the
  interface has no way to tell from a real one. Every dispatch therefore runs inside a
  `pushErrorScope('validation')`, and a rejection becomes a thrown error. Caught.
- **A buffer read at the wrong offsets** is not rejected at all, because every offset
  is inside the buffer and every value is a number. **Nothing catches this at run
  time.** The defence is structural: neither the packing nor the shader may write an
  offset of its own. Both take them from one layout module, the shader interpolates
  them into its own source rather than restating them, and a check under `scripts/`
  confirms that every constant the layout declares still reaches the shader and that no
  record overruns its stride.

  **A workgroup size is one of those offsets**, because `flatIndex` multiplies by it
  once a dispatch passes 65,535 workgroups. It is written in three places — the
  `@workgroup_size` attribute, the `WORKGROUP_SIZE` the preamble reads, and the
  divisor the backend counts workgroups with — so all three interpolate one exported
  constant. Three literals that agreed today attributed every result in the second
  dispatch row to the wrong record the moment one of them moved, and the artifact
  scorer reaches that row at about two thousand artifacts against two thousand
  monsters.

  **A buffer larger than the card promises is a fourth failure, and the gentlest.**
  It is refused rather than misread, so the answer is right — but it is the
  processor's, on precisely the largest account, which is the one the card was for.
  Every implementation guarantees only 128 MiB for one storage binding, so a
  calculation whose buffers scale with the account splits its work into passes it
  knows will fit rather than finding out. Rune Clean-up sends 65,536 jobs at a time,
  which is 16 MiB of answers.

`verify:webgpu-parameter-layout` does this for the artifact scorer's uniform block and
`verify:rune-chance-layout` for the rune chance kernel. Both exist because **the
browsers Playwright drives in this repository expose no WebGPU at all** — every
automated check runs the processor's version, and no shader in this repository is ever
executed by a test. A change to a shader is verified by reading it, by the layout
check, and by the agreement gate on a real card.

## 5. What is accelerated, and what is not

| Calculation | Where it runs |
| --- | --- |
| Artifact score matrix (`compute/artifact-score-*`) | Worker; card or processor |
| Rune Clean-up odds (`compute/rune-chance-*`) | Worker; card or processor |
| Everything else | The processor |

The second of those is new, and the reason it was worth moving is the reason to be
careful about the rest: it is the same short arithmetic a few million times with no
lane depending on another. Most of what is left is not that shape. Relic verdicts are a
dynamic-programming table per relic, the craft planner is a join, the grids are sorts.
Moving those to a card would buy little and cost a second implementation each.

Even within an accelerated calculation, only the shaped part goes. Rune Clean-up hands
over one question — how many of a rune's runs cleared a bar — and keeps every
threshold, gate and tie-break on the processor. Artifact scoring hands over the matrix
and recovers each winning pair's conversion detail on the processor afterwards,
because that needs the whole reading and not its number.

**What is left to do is to get them off the main thread**, which is a different and
more valuable job: `relicAdvice`, `allocateRelicEngravings`, `craftReach` and the rune
simulator all run account-wide work synchronously while the page cannot paint. The two
calculations above are in workers precisely because that was the defect worth fixing
first, and acceleration followed.

## 6. The checks

| Check | What it holds |
| --- | --- |
| `verify:acceleration-routing` | One module opens a device, one weighs the setting, no worker branches on it or decides in advance what to report |
| `verify:webgpu-parameter-layout` | The artifact scorer's uniform block is the size the backend uploads, and its workgroup size is one constant rather than three literals |
| `verify:rune-chance-layout` | Every offset the rune chance shader reads is one the layout declares, and no record overruns its stride |

All three read source text. None of them executes a shader, because nothing in this
repository can.

## 7. Change procedure

Adding a card backend adds a file like `compute/rune-chance-engine.ts`: the processor's
half, the card's half, the agreement gate, and nothing else. It does not add a second
way of deciding whether to use a card — there is one, and it lives in
`accelerated-calculation.ts`.

Changing a shader changes the layout module in the same commit, or it changes nothing,
because the shader does not hold its own offsets.
