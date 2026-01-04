# CampusConnect | Modern Student Portal 🚀

CampusConnect is a high-performance student portal built with React, Vite, Tailwind CSS, and Supabase. It features real-time messaging, anonymous chat, subject management, and an admin panel.

## Key Features
- **Real-time Chat**: Direct DMs and Group chats with zero delay.
- **Anonymous Hall**: Chat anonymously with classmates (Admin can see real IDs for safety).
- **Subject Portal**: Organised library for Videos, Notes, and Links.
- **Admin Panel**: Manage subjects, upload materials, and send campus-wide notifications.
- **Premium UI**: Glassmorphism design with fluid animations.

## Quick Setup

### 1. Supabase Setup
1. Create a new project on [Supabase](https://supabase.com).
2. Go to the **SQL Editor** and run the contents of `supabase_schema.sql` (found in this repo).
3. Copy your project's **URL** and **Anon Key** from Project Settings > API.

### 2. Environment Variables
1. Rename `.env.example` to `.env`.
2. Paste your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=your-project-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

### 3. Installation
```bash
npm install
npm run dev
```

## Admin Access
- **Login Student ID**: `admin123`
- **Login Name**: (Any Name)

## Deployment
This app is ready to be deployed on **Vercel** or **Netlify**.
1. Push your code to GitHub.
2. Connect your repo to Vercel/Netlify.
3. Add the Environment Variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in the deployment settings.

---
Built with ❤️ for Campus Communication.
