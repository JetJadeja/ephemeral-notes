import { useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient"; // Assuming supabaseClient.ts is in src/lib

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleAuth = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let authResponse;
      if (isLogin) {
        authResponse = await supabase.auth.signInWithPassword({
          email,
          password,
        });
      } else {
        authResponse = await supabase.auth.signUp({ email, password });
        // Optional: Add email confirmation handling if enabled in Supabase
      }

      const { error: authError } = authResponse;

      if (authError) {
        throw authError;
      }

      // Redirect after successful login/signup
      // We'll likely redirect to a dashboard or the editor page
      router.push("/dashboard"); // Adjust destination as needed
    } catch (err: any) {
      setError(err.error_description || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="p-8 bg-white rounded shadow-md w-full max-w-sm">
        <h1 className="mb-6 text-2xl font-semibold text-center text-gray-700">
          {isLogin ? "Log In" : "Sign Up"}
        </h1>
        <form onSubmit={handleAuth}>
          <div className="mb-4">
            <label
              className="block mb-2 text-sm font-medium text-gray-600"
              htmlFor="email"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border rounded text-gray-700 focus:outline-none focus:ring focus:border-blue-300"
              placeholder="your.email@example.com"
            />
          </div>
          <div className="mb-6">
            <label
              className="block mb-2 text-sm font-medium text-gray-600"
              htmlFor="password"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border rounded text-gray-700 focus:outline-none focus:ring focus:border-blue-300"
              placeholder="********"
            />
          </div>
          {error && <p className="mb-4 text-xs text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 font-bold text-white bg-blue-500 rounded hover:bg-blue-700 focus:outline-none focus:shadow-outline disabled:bg-gray-400"
          >
            {loading ? "Processing..." : isLogin ? "Log In" : "Sign Up"}
          </button>
        </form>
        <p className="mt-4 text-sm text-center text-gray-600">
          {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError(null); // Clear errors when switching modes
            }}
            className="text-blue-500 hover:underline"
            type="button" // Prevent form submission
          >
            {isLogin ? "Sign Up" : "Log In"}
          </button>
        </p>
      </div>
    </div>
  );
}
