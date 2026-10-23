# Sample media

Demonstration photographs only. None of this is a real provider's work, and
none of it is reachable from anywhere a customer can upload.

## service_categories

Three photos per category, handed out by `scripts/build_sample_snapshot.py` so
that providers sharing a category do not show the same picture.

| Files | Source | Licence |
| --- | --- | --- |
| `*_1.jpg` | Generated for this project | Owned by the team |
| `*_2.jpg`, `*_3.jpg` (most) | [Pexels](https://www.pexels.com/license/) | Pexels Licence — free to use, modification allowed, attribution not required |
| `plumbing_2.jpg`, `plumbing_3.jpg` | [Unsplash](https://unsplash.com/license) | Unsplash Licence — free to use, commercial use allowed, attribution not required |

Photographers, from the original Pexels filenames: Artem Podrez, Bulat
Khamitov, Jsme MILA, Mizuno K, Ono Kosuki, Pavel Danilyuk, Ranjeet, RDNE Stock
Project, Anthony Shkraba, Sky Studio, Tima Miroshnichenko, Muhammed Diler, My
Car Key Hero. The two plumbing frames are by Bhagya Laxmi and Timur
Shakerzianov on Unsplash.

All files are 1448 × 1086 JPEG, quality 82. Keep them that way: the originals
were 2 MB PNGs, which is twenty times the weight for no visible gain at the
size a card renders them.

Every category now has three. `PHOTOS_PER_CATEGORY` in the snapshot builder
records the real count, and it wraps around a category that has fewer, so a
missing file degrades to repetition rather than a broken image.

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
