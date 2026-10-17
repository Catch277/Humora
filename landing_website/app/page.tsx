import Hero from "@/components/Hero";
import TrustBar from "@/components/TrustBar";
import PainPoints from "@/components/PainPoints";
import Solution from "@/components/Solution";
import FeatureBento from "@/components/FeatureBento";
import HowItWorks from "@/components/HowItWorks";
import Audience from "@/components/Audience";
import SocialProof from "@/components/SocialProof";
import Pricing from "@/components/Pricing";
import Faq from "@/components/Faq";
import FinalCta from "@/components/FinalCta";

export default function Home() {
  return (
    <>
      <Hero />
      <TrustBar />
      <PainPoints />
      <Solution />
      <FeatureBento />
      <HowItWorks />
      <Audience />
      <SocialProof />
      <Pricing />
      <Faq />
      <FinalCta />
    </>
  );
}