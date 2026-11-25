import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { currentUser } from "@/lib/api";
import { signOut } from "./actions";
import { SignIn } from "./forms";
import { Loading } from "./ui";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Support console",
  description: "Cases, customers and approval of copilot actions",
};

async function Account() {
  const user = await currentUser();
  if (!user) return null;
  return (
    <>
      <nav className="flex gap-4 text-sm">
        <Link href="/" className="hover:underline">Cases</Link>
        <Link href="/approvals" className="hover:underline">Approvals</Link>
        {user.scopes.includes("audit:read") && <Link href="/audit" className="hover:underline">Audit</Link>}
        {user.scopes.includes("webhooks:manage") && <Link href="/webhooks" className="hover:underline">Webhooks</Link>}
      </nav>
      <form action={signOut} className="ml-auto flex items-center gap-3 text-sm">
        <span className="text-muted">{user.name}</span>
        <button className="underline">Sign out</button>
      </form>
    </>
  );
}

async function Gate({ children }: { children: React.ReactNode }) {
  return (await currentUser()) ? children : (
    <section className="grid gap-4">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <SignIn />
    </section>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <span className="font-semibold">Support console</span>
            <Suspense fallback={null}><Account /></Suspense>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">
          <Suspense fallback={<Loading />}><Gate>{children}</Gate></Suspense>
        </main>
      </body>
    </html>
  );
}
