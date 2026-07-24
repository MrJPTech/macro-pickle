---
name: character-lock
description: Maintain strict character identity across multi-shot AI video sequences. Visual Anchor Workflow, Gemini JSON Protocol, redundant text anchoring. Use when creating consistent characters across multiple AI generations.
---

# Character Consistency for AI Video

Maintain strict character identity across multi-shot AI video and image sequences. This skill provides the Visual Anchor Workflow, Gemini JSON extraction protocol, and redundant text anchoring techniques to prevent character drift between generations.

## When to Use This Skill

- Creating a character that must appear identical across multiple video clips
- Building multi-shot sequences (establishing shot, medium, close-up) of the same person
- Preparing character reference sheets for Google Flow, Veo 3.1, or image generators
- Extracting identity details from an existing reference image
- Troubleshooting character drift between generations

## Visual Anchor Workflow

Four sequential steps that lock a character's identity before generation begins.

### Step 1: Establishing Shot (Create the Anchor Image)

Generate or select ONE hero image that defines the character. This becomes the ground truth for all subsequent shots.

**Requirements for a strong anchor image:**
- Full body visible (head to mid-thigh minimum)
- Neutral pose (standing or seated, facing camera or 3/4 angle)
- Clean background (solid color or minimal environment)
- Good lighting (even, no harsh shadows obscuring features)
- All key accessories visible (glasses, jewelry, hat, bag)

**Generation prompt template:**
```
Full-body portrait photograph of [FULL CHARACTER DESCRIPTION].
Standing in a neutral pose against a [solid gray / white] backdrop.
Even studio lighting, sharp focus, high detail. No motion blur.
Photorealistic, 85mm portrait lens.
```

### Step 2: Asset Binding (Extract and Lock Identity)

Once you have the anchor image, extract every visual detail into a structured character sheet. This is your binding document -- every future prompt references it.

**Character Description Template:**

```
CHARACTER: [Name / Identifier]

FACE & BONE STRUCTURE:
- Face shape: [oval / square / heart / round / diamond]
- Jawline: [sharp / soft / angular / rounded]
- Cheekbones: [high and prominent / subtle / wide-set]
- Forehead: [broad / narrow / high / low]
- Nose: [straight / aquiline / button / wide bridge / narrow]
- Lips: [full / thin / asymmetric / cupid's bow]
- Eyes: [shape, color, spacing, brow arch]
- Ears: [visible? pierced? size relative to head]
- Skin tone: [specific description, not just "light" or "dark"]
- Distinguishing marks: [moles, scars, freckles, dimples]

HAIR:
- Color: [specific — not just "brown" but "warm chestnut with copper highlights"]
- Length: [inches or reference point — "falls to collarbone"]
- Texture: [straight / wavy / curly / coily / kinky]
- Style: [how it is worn — "parted left, tucked behind right ear"]
- Hairline: [widow's peak, receding, straight across]

BUILD & PROPORTIONS:
- Height impression: [tall / average / short — relative to environment]
- Build: [slim / athletic / stocky / heavyset / wiry]
- Shoulder width: [narrow / broad / proportional]
- Posture: [upright / slightly hunched / relaxed slouch]

CLOTHING:
- Top: [garment type, color, material, fit, condition]
- Bottom: [garment type, color, material, fit]
- Footwear: [type, color, condition]
- Outerwear: [if any — jacket, coat, vest]
- Fit notes: [oversized, tailored, casual, rumpled]

ACCESSORIES:
- Eyewear: [glasses type, frame color, lens shape]
- Jewelry: [rings, necklace, earrings, watch — which hand/ear]
- Bag/carry: [type, color, how carried]
- Hat/headwear: [type, color, how worn]
- Other: [phone, badge, lanyard, gloves]

AGE INDICATORS:
- Estimated age range: [e.g., "early 30s"]
- Age markers: [crow's feet, laugh lines, gray at temples, youthful skin]
```

### Step 3: Reference Upload (Feed the Model)

When using platforms that support reference images (Google Flow, Midjourney, etc.), upload the anchor image as a visual reference.

**Google Flow @ referencing:**
```
Upload anchor image to Asset Grid → Add to Collection named "[Character Name]"
Reference in prompt: @[Character Name] — the same woman from the reference image
```

**Text-only platforms (no image upload):**
Skip to Step 4 and rely entirely on redundant text anchoring.

### Step 4: Redundant Text Anchoring

Repeat the FULL character description in every single prompt. Do not abbreviate. Do not assume the model "remembers" from a previous generation.

**Redundancy rules:**
1. Copy-paste the complete character sheet into every prompt
2. Place character description BEFORE the action/scene description
3. Add the phrase "identical to the reference" or "maintaining exact appearance from previous shots" even in text-only workflows
4. Include 3+ unique identifiers in every prompt (e.g., "copper-highlighted chestnut hair, tortoiseshell cat-eye glasses, silver thumb ring on left hand")

**Example anchored prompt:**
```
Medium close-up, shallow depth of field. The same woman from the reference —
early 30s, oval face, high cheekbones, warm chestnut hair with copper highlights
falling to her collarbone, parted left. Tortoiseshell cat-eye glasses. Silver
thumb ring on left hand. Wearing the same oversized cream cable-knit sweater
over a white collared shirt. She leans forward over a desk, studying a document,
brow slightly furrowed in concentration. Warm afternoon light from a window
camera-left. Shallow depth of field, background office blurred.
```

## Gemini JSON Protocol

Use Gemini (or any vision-capable LLM) to extract structured identity data from a reference image. This creates a machine-readable character sheet.

### The Extraction Prompt

Send this exact prompt to Gemini along with the character's anchor image:

```
Analyze this image and extract a complete character identity profile.
Return the result as a JSON object with the following structure.
Be extremely specific — use precise color names, measurements relative
to facial features, and detailed texture descriptions. This JSON will
be used to maintain visual consistency across multiple AI-generated
video shots.

{
  "character_id": "unique_name",
  "face": {
    "shape": "",
    "skin_tone": "",
    "jawline": "",
    "cheekbones": "",
    "forehead": "",
    "nose": "",
    "lips": "",
    "eyes": {
      "shape": "",
      "color": "",
      "spacing": "",
      "brow_shape": "",
      "lashes": ""
    },
    "distinguishing_marks": []
  },
  "hair": {
    "color": "",
    "length": "",
    "texture": "",
    "style": "",
    "hairline": ""
  },
  "build": {
    "height_impression": "",
    "body_type": "",
    "shoulder_width": "",
    "posture": ""
  },
  "clothing": {
    "top": {
      "garment": "",
      "color": "",
      "material": "",
      "fit": ""
    },
    "bottom": {
      "garment": "",
      "color": "",
      "material": "",
      "fit": ""
    },
    "footwear": {
      "type": "",
      "color": ""
    },
    "outerwear": null
  },
  "accessories": [],
  "age_range": "",
  "age_markers": [],
  "unique_identifiers": [
    "The 3-5 most distinctive visual traits that differentiate this character"
  ]
}
```

### Using the JSON Output

1. Store the JSON alongside your anchor image as the canonical character reference
2. Convert the `unique_identifiers` array into your redundant text anchor phrase
3. When building prompts, serialize relevant JSON fields back into natural language
4. Share the JSON with collaborators working on the same character

## Nano Banana 2 Limits

Google's Nano Banana 2 (the identity preservation system in Veo 3.1 and Flow) has hard limits:

| Resource | Limit |
|----------|-------|
| **Characters** | Maximum **5** distinct characters per project |
| **Objects** | Maximum **14** tracked objects per project |
| **Reference images** | 1-3 per character (more is not always better) |
| **Total ingredients** | 4 per generation (Subject + Prop + Environment + Style) |

### Working Within Limits

- **Plan your cast**: Decide on your 5 characters before starting. You cannot add more mid-project.
- **Prioritize hero characters**: If your story has 8 characters, only lock the 5 most important. Use generic descriptions for extras.
- **Object budget**: Track your 14 object slots. Props that appear once do not need a slot.
- **Reference quality over quantity**: One sharp, well-lit reference image beats three mediocre ones.

## Google Flow @ Referencing

When using Google Flow's Asset Grid, reference uploaded ingredients with the @ symbol:

```
@[Asset Name] — [description reinforcing identity]
```

**Examples:**
```
@Sarah — the same woman with chestnut hair and tortoiseshell glasses
@vintage-camera — the same brass Leica M3 from the opening shot
@tokyo-alley — the same narrow Shinjuku backstreet from Scene 1
```

**Rules:**
- The @ name must match the asset name in your Collection exactly
- Always follow @ reference with a text description (redundant anchoring)
- Reference maximum 4 ingredients per generation

## Preventing Character Drift

Common causes of drift and how to counter them:

### Problem: Face Changes Between Shots

**Cause**: Insufficient facial detail in prompt or no reference image.

**Fix**:
- Always include bone structure descriptors (jawline, cheekbones, face shape)
- Add 2+ distinguishing facial marks (mole position, dimple, scar)
- Use the same lighting direction across shots (consistency in shadow = consistency in perceived face shape)

### Problem: Clothing Changes Unexpectedly

**Cause**: Clothing description is too generic or placed too late in prompt.

**Fix**:
- Describe clothing with material + color + fit + condition
- Place clothing description immediately after face/hair
- Use the phrase "wearing the same [item] as before" explicitly

### Problem: Age or Build Shifts

**Cause**: Age/build descriptors are vague or omitted in some prompts.

**Fix**:
- Include age range AND specific age markers in every prompt
- Describe build relative to environment ("fills the doorframe" vs "slight frame against the wide corridor")

### Problem: Accessories Appear/Disappear

**Cause**: Accessories mentioned inconsistently across prompts.

**Fix**:
- Create a checklist of all accessories and verify each prompt includes them
- Specify which hand/ear/wrist for every accessory
- Note when an accessory is intentionally REMOVED in a scene

### Problem: Hair Changes Style or Color

**Cause**: Hair description too brief. "Brown hair" can generate dozens of variations.

**Fix**:
- Specify color with modifiers (warm, cool, ash, golden)
- Describe length relative to body ("falls past shoulder blades")
- Describe current styling ("pulled into a low ponytail with loose strands framing face")
- Mention part direction and hairline shape

## Multi-Shot Sequence Checklist

Before generating each shot in a sequence:

```
[ ] Anchor image created or selected
[ ] Character sheet (text or JSON) complete
[ ] Unique identifiers listed (3-5 traits)
[ ] Full character description pasted into this prompt
[ ] Clothing matches previous shot (or change is intentional and noted)
[ ] Accessories accounted for (all present or removal noted)
[ ] Lighting direction consistent with previous shots
[ ] @ reference used (if platform supports it)
[ ] Negative prompt includes: character drift, inconsistent appearance,
    changed clothing, different face
```
