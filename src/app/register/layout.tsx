import type { Metadata } from "next";
import { Cinzel, Cormorant_Garamond, DM_Sans } from "next/font/google";
import "./register.css";

/*
 * The public front door (CJ, 30 Sep 2026). Outside the (app) group on
 * purpose: nobody signs in to browse or to pay. Its look is novapa.org's
 * registration page — the three faces that page loads from Google Fonts,
 * served here through next/font so nothing is fetched from Google at runtime.
 */
const caps = Cinzel({ variable: "--reg-caps", subsets: ["latin"], weight: ["600", "700"] });
const serif = Cormorant_Garamond({ variable: "--reg-serif", subsets: ["latin"], weight: ["500", "600", "700"] });
const sans = DM_Sans({ variable: "--reg-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Register",
  description: "Register for NoVAPA classes, shows, camps and more.",
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <div className={`npa-reg ${caps.variable} ${serif.variable} ${sans.variable}`}>{children}</div>;
}
