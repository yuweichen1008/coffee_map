import Link from 'next/link';
import { useState } from 'react';

const taipeiDistricts = [
  'Da'an', 'Xinyi', 'Wanhua', 'Datong', 'Zhongzheng', 'Songshan',
  'Zhongshan', 'Neihu', 'Wenshan', 'Nangang', 'Shilin', 'Beitou'
];

const storeTypes = ['cafe', 'grocery store', 'beverage store', 'boba'];

export default function RequestPage() {
  const [selectedDistrict, setSelectedDistrict] = useState(taipeiDistricts[0]);
  const [selectedStoreType, setSelectedStoreType] = useState(storeTypes[0]);
  const [result, setResult] = useState<{ profit: string, successRate: string } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real application, you would send a request to a backend service
    // to get the potential return on profit and success rate.
    // For now, we'll just return some placeholder data.
    setResult({
      profit: '15%',
      successRate: '75%',
    });
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Request a Business Analysis</h1>
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label htmlFor="district-select" className="block text-sm font-medium text-gray-700">
            District
          </label>
          <select
            id="district-select"
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
          >
            {taipeiDistricts.map((district) => (
              <option key={district} value={district}>
                {district}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-4">
          <label htmlFor="store-type-select" className="block text-sm font-medium text-gray-700">
            Store Type
          </label>
          <select
            id="store-type-select"
            value={selectedStoreType}
            onChange={(e) => setSelectedStoreType(e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
          >
            {storeTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          Analyze
        </button>
      </form>

      {result && (
        <div className="mt-8">
          <h2 className="text-xl font-bold mb-4">Analysis Results</h2>
          <p>
            <strong>Potential Return on Profit:</strong> {result.profit}
          </p>
          <p>
            <strong>Success Rate:</strong> {result.successRate}
          </p>
        </div>
      )}

      <div className="mt-8">
        <Link href="/" className="text-blue-500 hover:underline">
          Back to Map
        </Link>
      </div>
    </div>
  );
}
