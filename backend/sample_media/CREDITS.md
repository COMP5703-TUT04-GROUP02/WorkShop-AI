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
| moving | 6 | 6 | none |
| other | 6 | 6 | none |
| plumbing | 6 | 6 | none |
| cleaning | 4 | 6 | two photographs twice |
| elderly_care | 5 | 6 | one photograph twice |
| locksmith | 5 | 6 | one photograph twice |
| painter | 5 | 6 | one photograph twice |
| technician | 4 | 6 | two photographs twice |
| electrician | 3 | 6 | every photograph twice |

Electrician is the one still short, and the reason is worth keeping: of the
seven frames the source kits offered, three show workers in another company's
branded hi-vis and one is too dark to read. Those cannot be used — a demo
provider card must not appear to be a real business. The same rule removed a
uniform reading ТЕХНОБЫТСЕРВИС from technician, three black and white frames
(two in cleaning, one in locksmith), and the second frame of a shoot already
in use from painter, moving and technician.

Check that last one by measure, not by eye: a thumbnail of a low-chroma scene
looks like a black and white photograph, and a black and white photograph in a
grid of colour ones looks like a bug. Mean HSV saturation under about 10 is
greyscale; a grey primer wall or a metal condenser sits near 17 and is fine.

4:3 JPEG at quality 82, cropped from the centre at the source's own
resolution — no upscaling, so between 1047 and 1200 pixels wide. That is twice
what a card renders.

| Trade | Pexels ID | Subject | Page |
| --- | --- | --- | --- |
| cleaning | 6197121 | Professional cleaning team | https://www.pexels.com/photo/6197121/ |
| cleaning | 7641543 | Vacuum cleaning bedroom | https://www.pexels.com/photo/7641543/ |
| cleaning | 4792773 | Vacuum cleaning wooden floor | https://www.pexels.com/photo/4792773/ |
| cleaning | 7641496 | Mopping a living room | https://www.pexels.com/photo/7641496/ |
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

## avatars

The five demo customers. Providers are deliberately left without one: the
search card prefers an avatar over the portfolio image, and the work is what
sells a provider.

512 x 512 JPEG, from [Pexels](https://www.pexels.com/license/). Photographers:
Gabby K, Ferhat Ten, Khabbab Abdelmaqsoud, Tima Miroshnichenko, Faruk
Canpolat.

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
