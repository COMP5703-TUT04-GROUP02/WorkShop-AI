# Sample provider photos — how to make the missing twenty

The ten photos in `backend/sample_media/service_categories/` are a generated
set, and a deliberately consistent one. Every frame is the same world:

- a bright modern Istanbul flat, white walls, pale wood, plants
- a window with the Bosphorus, the suspension bridge or a mosque dome behind it
- the worker in **navy work overalls**, mid-task, three-quarter view, not
  looking at the camera
- an open tool case on the floor in most frames
- warm midday daylight, realistic photography, no text, no logos
- 1448 × 1086 (4:3)

Thirty providers currently share these ten files, so three cards in a row show
the same picture. The fix is twenty more frames **in this same style** — two
extra per category.

Do not fill the gap with stock photography. Openly-licensed stock for these
trades is mostly either historical archive material or studio product shots;
dropping those between the existing frames looks worse than the repetition,
because the set stops reading as one platform.

## Style block

Prepend this to every prompt:

> Photorealistic interior photograph, bright modern Istanbul apartment, white
> walls, pale oak floor, houseplants, large window with the Bosphorus and a
> suspension bridge or mosque domes visible behind, warm midday daylight, soft
> natural shadows, worker in navy blue work overalls, open tool case on the
> floor, candid three-quarter view, subject not looking at the camera, shallow
> depth of field, no text, no logos, no watermark, 4:3.

## The twenty frames

Save each as `<category>_2.jpg` and `<category>_3.jpg` next to the existing
files, 1448 × 1086, JPEG quality 82 (the current PNGs are 2 MB each; JPEG at
that quality is about 120 KB and indistinguishable at card size).

| File | Scene |
| --- | --- |
| `plumbing_2` | Plumber on one knee tightening a valve behind a washing machine, bathroom doorway |
| `plumbing_3` | Plumber testing water pressure at a newly fitted kitchen mixer tap, hand under the flow |
| `electrician_2` | Electrician on a step ladder wiring a ceiling light rose, pendant lamp hanging loose |
| `electrician_3` | Electrician fitting a wall socket at skirting height, cable tester in hand |
| `cleaning_2` | Cleaner wiping floor-to-ceiling windows with a squeegee, city behind the glass |
| `cleaning_3` | Cleaner running a vacuum over a living-room rug, cushions stacked on the sofa arm |
| `painter_2` | Painter cutting in along a ceiling line with a brush, masking tape on the trim |
| `painter_3` | Painter rolling a second coat onto a bedroom wall, roller tray on dust sheets |
| `moving_2` | Two movers carrying a wrapped mattress through a hallway, boxes stacked behind |
| `moving_3` | Mover taping a box shut on a kitchen counter, labelled boxes beside the door |
| `locksmith_2` | Locksmith fitting a new cylinder into an apartment door, old lock on the mat |
| `locksmith_3` | Locksmith testing a handle set on a balcony door, key in hand |
| `technician_2` | Technician pulling the filter drawer from a dishwasher, panel open |
| `technician_3` | Technician checking the back of a fridge with a multimeter, fridge pulled out |
| `childcare_2` | Carer reading a picture book with two children on a playroom rug |
| `childcare_3` | Carer helping a child with a jigsaw at a low table, toys in a basket |
| `elderly_care_2` | Carer helping an older man with a walking frame across the living room |
| `elderly_care_3` | Carer and an older woman having tea at a dining table by the window |
| `other_2` | Handyman mounting a floating shelf, spirit level across the bracket |
| `other_3` | Handyman adjusting a sticking door hinge with a screwdriver |

## After the files land

1. Drop them into `backend/sample_media/service_categories/`.
2. Run `python scripts/build_sample_snapshot.py`, which hands out one of the
   three variants per category so that providers 1, 11 and 21 never show the
   same frame.
3. Rebuild the database so migration 0018 reloads the snapshot.
