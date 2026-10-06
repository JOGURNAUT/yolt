import { formatIST } from "@/lib/format";
import { CLAIM_HOLD_MINUTES, getDropsStrip, getFreshFinds, getHome, getStoreFacts, getStoresToDiscover } from "@/lib/server/queries";
import { AnnouncementTicker } from "@/components/ui/announcement-ticker";
import { HeroCarousel, type HeroSlideDef } from "./hero-carousel";
import { BrandSlide, DropSlide, EditSlide, FitSlide, SellerSlide, StoreSlide } from "./hero-slides";
import {
  DropsStrip,
  FreshFinds,
  GrailsRail,
  GrailsSection,
  JustFoundAHome,
  ProductRow,
  Section,
  SectionHead,
  SellerBand,
  ShopByPrice,
  ShopByStyle,
  StoresToDiscover,
  TrendingSection,
  WhyYolt,
} from "./sections";
import { ShopYourSize } from "./shop-your-size";
import { ProductCard } from "@/components/product-card";

/** The landing page for guests (board B2.1, mobile "Main" and desktop "WebHome"). */
export async function GuestLanding() {
  const [home, strip, fresh, stores] = await Promise.all([getHome(), getDropsStrip(), getFreshFinds(), getStoresToDiscover(6)]);
  const facts = home.featuredStore ? await getStoreFacts(home.featuredStore.id) : null;

  const nextDrop = strip.drops[0] ?? null;
  const serverNow = strip.serverNow.toISOString();

  // The brand slide's collage: the newest pieces, preferring ones that have a photo.
  const withPhotos = fresh.filter((f) => f.coverUrl);
  const collage = (withPhotos.length >= 3 ? withPhotos : fresh).slice(0, 3);

  const slides: HeroSlideDef[] = [{ key: "brand", label: "Thrift without the DMs", tone: "dark", node: <BrandSlide pieces={collage} /> }];
  if (nextDrop) {
    slides.push({
      key: "drop",
      label: nextDrop.title,
      tone: "dark",
      node: <DropSlide drop={nextDrop} serverNow={serverNow} signedIn={false} reminderOn={false} holdMinutes={CLAIM_HOLD_MINUTES} />,
    });
  }
  if (home.featuredStore) {
    slides.push({ key: "store", label: `Store spotlight: ${home.featuredStore.displayName}`, tone: "dark", node: <StoreSlide store={home.featuredStore} facts={facts} /> });
  }
  // The seller slide takes the edit's place when no edit is running.
  slides.push(
    home.edit
      ? { key: "edit", label: `Edit: ${home.edit.title}`, tone: "light", node: <EditSlide title={home.edit.title} pieces={home.edit.items} /> }
      : { key: "sellers", label: "For sellers: bring your store", tone: "dark", node: <SellerSlide /> },
  );
  slides.push({ key: "fit", label: "Measured, not guessed", tone: "light", node: <FitSlide /> });

  const ticker = [
    nextDrop ? (nextDrop.live ? `${nextDrop.title} · Live now` : `${nextDrop.title} · ${formatIST(nextDrop.startsAt)}`) : null,
    "Every flaw photographed",
    "Pay safely through YOLT. Never a personal UPI QR",
  ].filter((t): t is string => t !== null);

  const grails = home.grails;
  return (
    <div className="page-wide">
      <h1 className="sr-only">YOLT: thrift without the DMs</h1>
      <AnnouncementTicker items={ticker} className="bleed-x -mt-4 mb-1 lg:-mt-6 lg:mb-3" />

      <div className="hero-bleed grid gap-6 lg:grid-cols-12">
        <HeroCarousel slides={slides} className={`h-[330px] lg:h-[348px] ${grails.length > 0 ? "lg:col-span-8" : "lg:col-span-12"}`} />
        {grails.length > 0 && <GrailsRail items={grails} />}
      </div>

      <TrendingSection mode={home.trending.mode} items={home.trending.items} />

      {home.edit && (
        <Section id="edit" labelledBy="edit-h">
          <SectionHead id="edit-h" title={home.edit.title} caption="The edit · picked by YOLT" href="/search?sort=newest" />
          <ProductRow>
            {home.edit.items.map((item) => (
              <div key={item.id} className="w-[164px] lg:w-auto">
                <ProductCard item={item} showSeller />
              </div>
            ))}
          </ProductRow>
        </Section>
      )}

      <GrailsSection items={grails} railShown={grails.length > 0} />

      <div className="grid gap-6 lg:grid-cols-12">
        {strip.drops.length > 0 && (
          <div className="pt-10 lg:col-span-5 lg:pt-16">
            <DropsStrip drops={strip.drops} signedIn={false} reminders={new Set()} className="h-full" />
          </div>
        )}
        <div className={`pt-10 lg:pt-16 ${strip.drops.length > 0 ? "lg:col-span-7" : "lg:col-span-12"}`}>
          <ShopYourSize className="h-full" />
        </div>
      </div>

      <FreshFinds items={fresh} />
      <WhyYolt />
      <ShopByPrice />
      <ShopByStyle />
      <StoresToDiscover stores={stores} followed={new Set()} signedIn={false} />
      <JustFoundAHome items={home.justSold} />
      <SellerBand />
    </div>
  );
}
