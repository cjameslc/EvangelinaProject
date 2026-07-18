import { Providers } from "../providers";

export default async function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <main className="min-h-[100vh] flex items-center justify-center bg-[var(--bg)]">{children}</main>
    </Providers>
  );
}
