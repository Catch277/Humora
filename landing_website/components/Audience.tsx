import AudienceTabs from "./audience/AudienceTabs";

export default function Audience() {
  return (
    <section id="audience" className="bg-surface py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="mx-auto max-w-3xl text-center font-heading text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">
          Humora phù hợp với cách bạn vận hành
        </h2>
        <AudienceTabs />
      </div>
    </section>
  );
}