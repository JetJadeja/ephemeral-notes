import { useRouter } from "next/router";
import { TypeAnimation } from "react-type-animation";

export default function Home() {
  const router = useRouter();

  const goToDashboard = () => {
    router.push("/dashboard");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center bg-white">
      <div className="flex flex-col max-w-[600px] items-center">
        {/* Headline changed to 'Transient', adjusted spacing */}
        <h1 className="text-4xl md:text-5xl font-bold mb-6 text-gray-900">
          Transient
        </h1>

        {/* Typewriter Sub-headline - Removed prefix, adjusted spacing */}
        <div className="text-xl md:text-2xl text-gray-700 mb-10 h-14 md:h-7">
          <TypeAnimation
            sequence={[
              "Where words fade...", // Prefix removed
              2000,
              "Forcing focus.", // Prefix removed
              2000,
              "Like thinking on paper.", // Prefix removed
              2000,
              "No clutter, just thought.", // Prefix removed
              2000,
            ]}
            wrapper="span"
            cursor={true}
            repeat={Infinity}
            speed={50}
            deletionSpeed={70}
          />
        </div>

        {/* Body text rewritten to be shorter, adjusted spacing */}
        <p className="text-base text-gray-600 mb-12 px-4">
          A notepad where text fades after 60 seconds. Capture your stream of
          consciousness, boost focus, and think freely without the pressure of
          permanence.
        </p>

        {/* Call to Action Button - Adjusted spacing */}
        <button
          onClick={goToDashboard}
          className="px-8 py-3 bg-gray-800 text-white font-semibold rounded-md hover:bg-gray-700 transition-colors duration-200 shadow-md mb-24"
        >
          Start Thinking Now
        </button>

        {/* Credit Line - Removed extra margin-top */}
        <p className="text-xs text-gray-500">
          Inspired by (forked from) "ephemeral notes" by Will Depue.
        </p>
      </div>
    </div>
  );
}
