import Link from 'next/link';

export default function About() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">About Us</h1>
      <p className="mb-4">
        This is a coffee shop locator application. It helps business owners to find the best location for their next coffee shop.
      </p>
      <p>
        <Link href="/" className="text-blue-500 hover:underline">
          Back to Map
        </Link>
      </p>
    </div>
  );
}
