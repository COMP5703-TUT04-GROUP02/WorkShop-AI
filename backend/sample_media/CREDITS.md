# Sample media

Demonstration photographs only. None of this is a real provider's work, and
none of it is reachable from anywhere a customer can upload.

## service_categories

Photographs of the trades, from [Pexels](https://www.pexels.com/license/) under
the Pexels Licence: free to use, modification allowed, attribution not
required. They replace the generated set, which repeated and read as AI.

`PHOTOS_PER_CATEGORY` in `scripts/build_sample_snapshot.py` records how many a
trade actually has, and `PORTFOLIOS_PER_CATEGORY` records how many portfolios
carry it. Six portfolios per trade (30 providers, two trades each) is the
number to match, so six photographs is the point at which none repeats:

| Trade | Photographs | Portfolios | Repeats |
| --- | --- | --- | --- |
| childcare | 6 | 6 | none |
| cleaning | 6 | 6 | none |
| electrician | 6 | 6 | none |
| moving | 6 | 6 | none |
| other | 6 | 6 | none |
| painter | 6 | 6 | none |
| plumbing | 6 | 6 | none |
| elderly_care | 5 | 6 | one photograph twice |
| locksmith | 5 | 6 | one photograph twice |
| technician | 5 | 6 | one photograph twice |

Nineteen frames across the four source kits were not usable, and the reasons
are worth keeping, because every kit has offered the same kinds again.

Six show workers in another company's branding — ELITE POWER GROUP on three
electricians, and ТЕХНОБЫТСЕРВИС twice plus ИК ИНОСЕРВИС once on technicians.
A demo provider card must not appear to be a real business. Read the garment,
not the thumbnail: the ИК ИНОСЕРВИС polo needed a 4x enlargement of the chest
before the embroidery was legible.

Three are black and white, which reads as a bug in a grid of colour ones. One
more wore a shirt reading VOLUNTEER, which on a marketplace that charges for
the work implies something untrue about who the providers are.

The rest are the second frame of a shoot already in use — adjacent Pexels ids
are the tell, 27928761 beside the 27928762 we use is the same man at the same
panel — or too dark to read at card size, or a subject that does not read as
the trade. Two of the top-up links were photographs already in the product.

Elderly care, locksmith and technician are the three still at five. Locksmith
has nothing left to try: both links offered for it were already in use.

Check that last one by measure, not by eye: a thumbnail of a low-chroma scene
looks like a black and white photograph, and a black and white photograph in a
grid of colour ones looks like a bug. Mean HSV saturation under about 10 is
greyscale; a grey primer wall or a metal condenser sits near 17 and is fine.

4:3 JPEG at quality 82, cropped from the centre at the source's own
resolution — no upscaling, so between 1047 and 1400 pixels wide. That is twice
what a card renders.

| Trade | Pexels ID | Subject | Page |
| --- | --- | --- | --- |
| cleaning | 6197121 | Professional cleaning team | https://www.pexels.com/photo/6197121/ |
| cleaning | 7641543 | Vacuum cleaning bedroom | https://www.pexels.com/photo/7641543/ |
| cleaning | 4792773 | Vacuum cleaning wooden floor | https://www.pexels.com/photo/4792773/ |
| cleaning | 7641496 | Mopping a living room | https://www.pexels.com/photo/7641496/ |
| cleaning | 9462734 | Window cleaning | https://www.pexels.com/photo/9462734/ |
| cleaning | 4107278 | Carpet vacuuming | https://www.pexels.com/photo/4107278/ |
| childcare | 8535599 | Kids doing artwork | https://www.pexels.com/photo/8535599/ |
| childcare | 8363733 | Children playing with teacher | https://www.pexels.com/photo/8363733/ |
| childcare | 8613119 | Teaching children | https://www.pexels.com/photo/8613119/ |
| childcare | 8422126 | Preschool teacher and pupils | https://www.pexels.com/photo/8422126/ |
| childcare | 28097500 | Children playing with teacher | https://www.pexels.com/photo/28097500/ |
| childcare | 18506737 | Teacher and children in classroom | https://www.pexels.com/photo/18506737/ |
| elderly_care | 29372727 | Home mobility assistance | https://www.pexels.com/photo/29372727/ |
| elderly_care | 29372729 | Caregiver helping with sewing | https://www.pexels.com/photo/29372729/ |
| elderly_care | 29372534 | Senior companion greeting | https://www.pexels.com/photo/29372534/ |
| elderly_care | 18429371 | Wheelchair companion | https://www.pexels.com/photo/18429371/ |
| elderly_care | 7551611 | Elderly assisted exercise | https://www.pexels.com/photo/7551611/ |
| electrician | 27928762 | Electrical panel work | https://www.pexels.com/photo/27928762/ |
| electrician | 38760190 | Power lines repair | https://www.pexels.com/photo/38760190/ |
| electrician | 21357685 | Power lines repairs | https://www.pexels.com/photo/21357685/ |
| electrician | 5691590 | Outlet wiring with pliers | https://www.pexels.com/photo/5691590/ |
| electrician | 4981803 | Electrical switch installation | https://www.pexels.com/photo/4981803/ |
| electrician | 257736 | Opened switchboard | https://www.pexels.com/photo/257736/ |
| locksmith | 17124739 | Automotive lock work | https://www.pexels.com/photo/17124739/ |
| locksmith | 35287856 | Key cutting with locksmith tools | https://www.pexels.com/photo/35287856/ |
| locksmith | 35578808 | Locksmith crafting a key in shop | https://www.pexels.com/photo/35578808/ |
| locksmith | 30413861 | Mobile locksmith key machine | https://www.pexels.com/photo/30413861/ |
| locksmith | 64609 | Craftsman at key making workbench | https://www.pexels.com/photo/64609/ |
| moving | 7464393 | Carrying sofa | https://www.pexels.com/photo/7464393/ |
| moving | 6169670 | Boxes delivery | https://www.pexels.com/photo/6169670/ |
| moving | 4246272 | Moving house | https://www.pexels.com/photo/4246272/ |
| moving | 7203784 | Boxes in room | https://www.pexels.com/photo/7203784/ |
| moving | 4246113 | Packing moving boxes | https://www.pexels.com/photo/4246113/ |
| moving | 7218678 | Office relocation | https://www.pexels.com/photo/7218678/ |
| other | 32357250 | Carpentry saw | https://www.pexels.com/photo/32357250/ |
| other | 6790079 | Sanding wood | https://www.pexels.com/photo/6790079/ |
| other | 9029162 | Lawn mowing | https://www.pexels.com/photo/9029162/ |
| other | 32357249 | Woodworking machinery | https://www.pexels.com/photo/32357249/ |
| other | 34006937 | Carpenter using circular saw | https://www.pexels.com/photo/34006937/ |
| other | 7480453 | Carpenter with hand tools | https://www.pexels.com/photo/7480453/ |
| painter | 6474471 | Painting interior wall | https://www.pexels.com/photo/6474471/ |
| painter | 5798972 | Painting with roller | https://www.pexels.com/photo/5798972/ |
| painter | 5482143 | Interior wall painting | https://www.pexels.com/photo/5482143/ |
| painter | 6764282 | Paint roller on textured wall | https://www.pexels.com/photo/6764282/ |
| painter | 6764265 | Woman painting interior wall | https://www.pexels.com/photo/6764265/ |
| painter | 31608473 | Exterior wall from a ladder | https://www.pexels.com/photo/31608473/ |
| plumbing | 16509869 | Pipe spanner repair | https://www.pexels.com/photo/16509869/ |
| plumbing | 39885416 | Working copper pipe | https://www.pexels.com/photo/39885416/ |
| plumbing | 6419128 | Plumber installing pipe fittings | https://www.pexels.com/photo/6419128/ |
| plumbing | 10246156 | Adjusting metal water pipe | https://www.pexels.com/photo/10246156/ |
| plumbing | 29226620 | Plumber fitting radiator pipe | https://www.pexels.com/photo/29226620/ |
| plumbing | 7859953 | Boiler plumbing maintenance | https://www.pexels.com/photo/7859953/ |
| technician | 5463580 | AC repair | https://www.pexels.com/photo/5463580/ |
| technician | 5463575 | AC inspection | https://www.pexels.com/photo/5463575/ |
| technician | 5463581 | Drilling AC unit casing | https://www.pexels.com/photo/5463581/ |
| technician | 7347538 | Aircon exterior repairs | https://www.pexels.com/photo/7347538/ |
| technician | 442154 | Server hardware repair | https://www.pexels.com/photo/442154/ |

## avatars

The five demo customers. Providers are deliberately left without one: the
search card prefers an avatar over the portfolio image, and the work is what
sells a provider.

512 x 512 JPEG, from [Pexels](https://www.pexels.com/license/). Photographers:
Gabby K, Ferhat Ten, Khabbab Abdelmaqsoud, Tima Miroshnichenko, Faruk
Canpolat.

Keep the photographer's framing. An earlier pass cropped the first one closer
so the face would fill the circle, and cut the top of the head and the chin
with it; the headroom and the shoulders are what make it read as a portrait
rather than a mistake. These render inside a circle at 30 to 88 points.

## brand

`istanbul.jpg` — the sign-in panel, by Senanur Ceylan.
`istanbul-signup.jpg` — the create-account panel, by Erdem Akil.

Both 1200 x 1600 JPEG from Pexels, cropped 3:4 because the panel is roughly
1:2 and a landscape crop loses its sides to `cover`.

Both photographs are of Istanbul, but the platform covers all 81 provinces of
Türkiye — the copy beside them says so, and should not be narrowed to one city
to match the pictures.

## Provider portfolios in the product

Separate matter. Real providers upload their own photographs, and the admin
portfolio review exists to reject stock imagery. Nothing here is seeded into
that flow.
