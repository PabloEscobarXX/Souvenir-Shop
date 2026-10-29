# PUP Souvenir Shop

Creative browser-based point-of-sale system for a souvenir shop.

## Included
- Creative responsive UI
- Illustrated product images for each default souvenir
- Search and category filters
- Shopping cart
- Inventory management
- Stock deduction
- Cash / GCash / Maya / Card selection
- Cash and change calculator
- Fixed or percentage discounts
- Sales history
- Printable receipt
- Role-based prototype entry for Souvenir Shop and RGO
- RGO daily/monthly sales reporting and read-only inventory
- Offline browser storage using localStorage

## Run in VS Code
1. Extract the ZIP.
2. Open the folder in VS Code.
3. Install the "Live Server" extension.
4. Right-click `index.html`.
5. Select **Open with Live Server**.

## Notes
All sample product artwork is stored locally inside the `assets` folder.
The app does not require internet access.

Data is saved only in the current browser using localStorage. For a real business deployment,
use a database/backend such as Firebase, Supabase, MySQL, PostgreSQL, or SQLite.
The role selection is a UI prototype, not secure authentication or authorization. Anyone with
access to this browser can change roles or modify local data; production access control must be
enforced by a backend.
