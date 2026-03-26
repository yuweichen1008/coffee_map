import Link from 'next/link';
import { useState } from 'react';

const taipeiDistricts = [
  'Da\'an', 'Xinyi', 'Wanhua', 'Datong', 'Zhongzheng', 'Songshan',
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
      profit: '25%',
      successRate: '85%'
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-8">
        <Link href="/" className="text-blue-600 hover:underline mb-4 block">
          ← Back to map
        </Link>
        
        <h1 className="text-3xl font-bold text-gray-800 mb-6">Request Analysis</h1>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-gray-700 font-semibold mb-2">
              District
            </label>
            <select
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {taipeiDistricts.map((district) => (
                <option key={district} value={district}>
                  {district}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2">
              Store Type
            </label>
            <select
              value={selectedStoreType}
              onChange={(e) => setSelectedStoreType(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            className="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition duration-200"
          >
            Get Analysis
          </button>
        </form>

        {result && (
          <div className="mt-8 p-4 bg-green-100 rounded-lg">
            <h2 className="text-xl font-bold text-green-800 mb-4">Analysis Results</h2>
            <p className="text-gray-700 mb-2">
              <span className="font-semibold">Expected Profit Growth:</span> {result.profit}
            </p>
            <p className="text-gray-700">
              <span className="font-semibold">Estimated Success Rate:</span> {result.successRate}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
