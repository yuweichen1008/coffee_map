import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase URL and Key are required.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

const taipeiDistricts = {
    'Da\'an': { lat: 25.026, lng: 121.543 },
    'Xinyi': { lat: 25.0348, lng: 121.5677 },
    'Wanhua': { lat: 25.026285, lng: 121.497032 },
    'Datong': { lat: 25.063, lng: 121.511 },
    'Zhongzheng': { lat: 25.03236, lng: 121.51827 },
    'Songshan': { lat: 25.055, lng: 121.554 },
    'Zhongshan': { lat: 25.05499, lng: 121.52540 },
    'Neihu': { lat: 25.0667, lng: 121.5833 },
    'Wenshan': { lat: 24.9897, lng: 121.5722 },
    'Nangang': { lat: 25.03843, lng: 121.621825 },
    'Shilin': { lat: 25.0833, lng: 121.5170 },
    'Beitou': { lat: 25.1167, lng: 121.5000 },
};

const storeTypes = ['cafe', 'grocery store', 'beverage store', 'boba'];

function getRandomElement<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomOffset(radius: number = 0.01) {
    return (Math.random() - 0.5) * 2 * radius;
}

async function seed() {
    const places = [];
    for (let i = 0; i < 50; i++) {
        const districtName = getRandomElement(Object.keys(taipeiDistricts));
        const district = taipeiDistricts[districtName];
        const storeType = getRandomElement(storeTypes);

        places.push({
            name: `${storeType} ${i + 1}`,
            address: `${districtName} District`,
            lat: district.lat + getRandomOffset(),
            lng: district.lng + getRandomOffset(),
            type: storeType,
            google_place_id: `mock_${Date.now()}_${i}`,
        });
    }

    const { data, error } = await supabase.from('places').insert(places);

    if (error) {
        console.error('Error seeding data:', error);
    } else {
        console.log('Successfully seeded 50 places.');
    }
}

seed();
