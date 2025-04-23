<img width="1200" alt="Transient Notes Screenshot" src="https://github.com/0hq/ephemeral-notes/assets/30643741/6e7cba7a-bcfd-4f22-b610-16ff43d56d61">

## Transient

**_Write to think, without the clutter._**

Transient is a minimalist web-based notepad designed to enhance focus and encourage stream-of-consciousness thinking. Based on the concept of "ephemeral notes," text you type gradually fades away shortly after being written (currently visual-only, persistent content is saved).

This forces you to keep moving forward, capturing thoughts without getting bogged down by editing or formatting. Unlike purely ephemeral tools, Transient allows you to:

- **Save your work:** Documents are tied to your user account.
- **Persist content:** Your full thoughts are saved, even as the visual text fades.
- **Publish:** Finalize a document to make it read-only and shareable.

The goal is to provide a space for focused thinking and drafting, reducing the friction between thought and text, while still allowing you to retain and share your work when ready.

### Features

- **Fading Text Editor:** Uses Draft.js to create a visual effect where typed text fades.
- **User Authentication:** Sign up and log in to manage your documents (powered by Supabase Auth).
- **Document Persistence:** Save and automatically update documents in the background (using Supabase Database).
- **Document Publishing:** Make documents read-only and publicly viewable.
- **Clean, Minimalist UI:** Focus purely on the text.

### Tech Stack

- **Framework:** [Next.js](https://nextjs.org/)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Editor:** [Draft.js](https://draftjs.org/)
- **Backend & Database:** [Supabase](https://supabase.io/)

### Development

To get started with development:

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/your-username/your-repo-name.git # Replace with your repo URL
    cd your-repo-name
    ```

2.  **Install dependencies:**
    Choose your package manager:

    ```bash
    npm install
    # or
    yarn install
    # or
    pnpm install
    ```

3.  **Set up Environment Variables:**
    You'll need a Supabase project. Create one at [supabase.com](https://supabase.com/).
    Create a `.env.local` file in the root of the project and add your Supabase URL and Anon Key:

    ```.env.local
    NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
    NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
    ```

    Replace `YOUR_SUPABASE_URL` and `YOUR_SUPABASE_ANON_KEY` with your actual Supabase project credentials.

4.  **Run the development server:**
    ```bash
    npm run dev
    # or
    yarn dev
    # or
    pnpm dev
    ```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
