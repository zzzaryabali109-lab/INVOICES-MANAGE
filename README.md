# Galaxy Invoice

Build a **100% fully functional Python-based web application** for **real-time container tracking**.
>
> ---
>
> ### 🔸 MAIN FUNCTIONALITY
>
> * User uploads an **Excel file** containing **Container Numbers**.
> * System reads all container numbers automatically.
> * For **each container**, fetch **real-time tracking data** using **Shipping Line APIs** (MSC, Maersk, CMA CGM, Hapag-Lloyd, etc.).
>
> ---
>
> ### 🔸 DATA TO FETCH & DISPLAY
>
> For every container number show:
>
> * Container Number
> * Shipping Line Name
> * Current Location
> * Vessel Name
> * Voyage Number
> * ETA
> * Last Status Update Date
> * Current Status (In Transit / Arrived / Discharged etc.)
>
> ---
>
> ### 🔸 API STRUCTURE (IMPORTANT)
>
> * Create a **separate API service layer** in backend.
> * Example API flow:
>
>   * `/upload-excel` → upload & read Excel
>   * `/track-container` → call shipping line API
>   * `/get-results` → return tracking results
> * Use `requests` library for external API calls.
> * Handle:
>
>   * API failures
>   * Invalid container numbers
>   * Rate limits
> * If API not available, return `Tracking Not Available`.
>
> ---
>
> ### 🔸 BACKEND REQUIREMENTS
>
> * Python (Flask or FastAPI)
> * Use:
>
>   * `pandas`
>   * `openpyxl`
>   * `requests`
> * Clean, modular, production-ready code
> * Auto-delete uploaded files after processing
> * Secure file handling
>
> ---
>
> ### 🔸 FRONTEND / UI-UX REQUIREMENTS
>
> * **Very beautiful, cute, modern, and professional UI**
> * Clean dashboard layout
> * Drag & drop Excel upload
> * Loading animation while tracking
> * Live updating results table
> * Mobile & desktop responsive
> * Professional color palette & smooth animations
>
> ---
>
> ### 🔸 EXPORT OPTIONS
>
> * Download tracking results as:
>
>   * Excel (.xlsx)
>   * CSV
>
> ---
>
> ### 🔸 FINAL REQUIREMENTS
>
> * Website must be **fully functional**
> * All buttons and actions must work
> * Real-time API integration
> * Ready to run on **localhost and server**
> * Provide clear setup instructions
>
> ---
>
> ### 🔹 GOAL
>
> Upload Excel → Track all containers in real time → View results → Download updated file.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://invoiceseeker.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/254877ff-6945-4a6e-9ccb-40eb8a73f345).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
