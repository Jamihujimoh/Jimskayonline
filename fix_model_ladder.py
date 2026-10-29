import io, sys

p = 'src/ai/model-router.ts'
s = io.open(p, 'r', encoding='utf-8', newline='').read()

old_ids = """export const MODEL_IDS = {
  flash35: 'googleai/gemini-3.5-flash',
  flashLite35: 'googleai/gemini-3.5-flash-lite',
  flashLite31: 'googleai/gemini-3.1-flash-lite',
  flash25: 'googleai/gemini-2.5-flash',
} as const;"""

new_ids = """export const MODEL_IDS = {
  flash38: 'googleai/gemini-3.8-flash',
  flash37: 'googleai/gemini-3.7-flash',
  flash35: 'googleai/gemini-3.5-flash',
  flash36: 'googleai/gemini-3.6-flash',
  flashLite35: 'googleai/gemini-3.5-flash-lite',
  flashLite31: 'googleai/gemini-3.1-flash-lite',
  flash25: 'googleai/gemini-2.5-flash',
} as const;"""

old_ladder = """const ASK_LADDER: readonly ModelId[] = [
  MODEL_IDS.flash25,
  MODEL_IDS.flashLite31,
  MODEL_IDS.flashLite35,
  MODEL_IDS.flash35,
];
const CREATOR_ASK_LADDER: readonly ModelId[] = [
  MODEL_IDS.flash35,
  MODEL_IDS.flashLite35,
  MODEL_IDS.flashLite31,
  MODEL_IDS.flash25,
];"""

new_ladder = """const ASK_LADDER: readonly ModelId[] = [
  MODEL_IDS.flash25,
  MODEL_IDS.flashLite31,
  MODEL_IDS.flashLite35,
  MODEL_IDS.flash35,
  MODEL_IDS.flash36,
  MODEL_IDS.flash37,
  MODEL_IDS.flash38,
];
const CREATOR_ASK_LADDER: readonly ModelId[] = [
  MODEL_IDS.flash38,
  MODEL_IDS.flash37,
  MODEL_IDS.flash36,
  MODEL_IDS.flash35,
  MODEL_IDS.flashLite35,
  MODEL_IDS.flashLite31,
  MODEL_IDS.flash25,
];"""

count = 0
for old, new in ((old_ids, new_ids), (old_ladder, new_ladder)):
    if old not in s:
        print('MISSING BLOCK:', old.splitlines()[0])
        sys.exit(1)
    s = s.replace(old, new, 1)
    count += 1

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('patched blocks:', count)
