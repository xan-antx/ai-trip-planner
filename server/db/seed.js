/**
 * Seeds cities and places. Idempotent — re-running updates rows in place
 * rather than duplicating them (relies on the UNIQUE (city_id, category, name)
 * constraint in schema.sql).
 *
 * Run with: npm run seed
 */
import pool from './pool.js';

/**
 * Coordinates, keyed by city then place name: [lat, lng].
 * Kept separate from the CITIES tuples so adding coordinates doesn't reshape
 * all 140 existing entries, and so it stays obvious which cities have them.
 *
 * Jaipur only for now — every other city seeds lat/lng as NULL and falls back
 * to area-based matching in the chat retrieval.
 *
 * NOTE: these are hand-entered approximations (good to roughly a block), not
 * geocoder output. They are accurate enough to cluster places at a 1.5 km
 * radius; re-geocode them if you ever need finer precision than that.
 */
const COORDS = {
  Jaipur: {
    // tourist_spot
    'Hawa Mahal': [26.9239, 75.8267],
    'Amber Fort': [26.9855, 75.8513],
    'City Palace': [26.9258, 75.8237],
    'Jantar Mantar': [26.9247, 75.8246],
    'Nahargarh Fort': [26.9374, 75.8153],
    'Jal Mahal': [26.9535, 75.8460],
    'Albert Hall Museum': [26.9117, 75.8194],
    // stay
    'Rambagh Palace': [26.8983, 75.8078],
    'Samode Haveli': [26.9333, 75.8283],
    'ITC Rajputana': [26.9247, 75.7908],
    'Alsisar Haveli': [26.9204, 75.7997],
    'Jai Mahal Palace': [26.9155, 75.7900],
    'Hotel Pearl Palace': [26.9130, 75.8060],
    'Zostel Jaipur': [26.9110, 75.7830],
    // restaurant
    'Chokhi Dhani': [26.7620, 75.8330],
    'Handi Restaurant': [26.9165, 75.8135],
    'Laxmi Mishthan Bhandar': [26.9209, 75.8266],
    Niros: [26.9163, 75.8155],
    '1135 AD': [26.9855, 75.8513],
    'Spice Court': [26.9130, 75.7920],
    'Rawat Mishtan Bhandar': [26.9192, 75.7930],
    // cafe
    'Tapri Central': [26.9060, 75.7990],
    'Curious Life Coffee Roasters': [26.9020, 75.7960],
    'Cafe Palladio': [26.8980, 75.8180],
    'Anokhi Cafe': [26.9040, 75.7980],
    'Tattoo Cafe & Lounge': [26.9243, 75.8270],
    'Wind View Cafe': [26.9241, 75.8271],
    'Jaipur Modern Kitchen': [26.9030, 75.7950],
  },
};

// [name, area, description, price_level]  — price_level is null for tourist_spot
const CITIES = {
  Jaipur: {
    tourist_spot: [
      ['Hawa Mahal', 'Badi Chaupar', 'The five-storey honeycomb facade built so royal women could watch street processions unseen.'],
      ['Amber Fort', 'Amer', 'Hilltop fort-palace in yellow sandstone, famous for its mirrored Sheesh Mahal.'],
      ['City Palace', 'Jalebi Chowk', 'Still-inhabited royal complex with courtyards, textile galleries and an armoury.'],
      ['Jantar Mantar', 'Tripolia Bazaar', 'UNESCO-listed observatory holding the world largest stone sundial.'],
      ['Nahargarh Fort', 'Aravalli Hills', 'Ridge-top fort with the best sunset view over the whole Pink City.'],
      ['Jal Mahal', 'Amer Road', 'Palace sitting half-submerged in Man Sagar Lake, best seen from the causeway.'],
      ['Albert Hall Museum', 'Ram Niwas Garden', 'Indo-Saracenic museum holding Rajasthan oldest collection of art and armour.'],
    ],
    stay: [
      ['Rambagh Palace', 'Bhawani Singh Road', 'Former Maharaja residence turned palace hotel set in 47 acres of gardens.', 'premium'],
      ['Samode Haveli', 'Gangapole', '19th-century painted haveli with a courtyard pool inside the old city walls.', 'premium'],
      ['ITC Rajputana', 'Palace Road', 'Large business hotel built around haveli-style courtyards near the station.', 'premium'],
      ['Alsisar Haveli', 'Sansar Chandra Road', 'Heritage haveli popular for its frescoed rooms and evening folk music.', 'mid'],
      ['Jai Mahal Palace', 'Civil Lines', '18th-century palace hotel with formal Mughal gardens.', 'premium'],
      ['Hotel Pearl Palace', 'Hathroi Fort', 'Long-running budget favourite with a rooftop restaurant and helpful desk.', 'budget'],
      ['Zostel Jaipur', 'Ajmer Road', 'Backpacker hostel with dorms, a cafe and organised old-city walks.', 'budget'],
    ],
    restaurant: [
      ['Chokhi Dhani', 'Tonk Road', 'Mock-village resort serving unlimited Rajasthani thalis with folk performances.', 'mid'],
      ['Handi Restaurant', 'MI Road', 'Institution for slow-cooked mutton handi and laal maas.', 'mid'],
      ['Laxmi Mishthan Bhandar', 'Johari Bazaar', 'Century-old vegetarian sweet shop and thali house, known as LMB.', 'budget'],
      ['Niros', 'MI Road', 'Old-school air-conditioned dining room serving Mughlai and continental since 1949.', 'mid'],
      ['1135 AD', 'Amber Fort', 'Fine-dining room inside Amber Fort courtyard, heavy on royal Rajasthani dishes.', 'premium'],
      ['Spice Court', 'Civil Lines', 'Garden restaurant best known for its laal maas and safed maas.', 'mid'],
      ['Rawat Mishtan Bhandar', 'Station Road', 'Famous for pyaaz kachori eaten standing at the counter.', 'budget'],
    ],
    cafe: [
      ['Tapri Central', 'C-Scheme', 'Rooftop tea cafe overlooking Central Park, packed with students in the evening.', 'budget'],
      ['Curious Life Coffee Roasters', 'C-Scheme', 'Specialty roastery pouring single-origin Indian coffee.', 'mid'],
      ['Cafe Palladio', 'Narain Niwas', 'Blue-and-gold designer cafe attached to a heritage hotel garden.', 'premium'],
      ['Anokhi Cafe', 'C-Scheme', 'Organic salads and cakes above the block-print textile store.', 'mid'],
      ['Tattoo Cafe & Lounge', 'Hawa Mahal Road', 'Rooftop cafe with a direct front-on view of Hawa Mahal.', 'budget'],
      ['Wind View Cafe', 'Hawa Mahal Road', 'Simple terrace spot facing Hawa Mahal, good for early morning chai.', 'budget'],
      ['Jaipur Modern Kitchen', 'C-Scheme', 'Airy cafe inside a design store, serving seasonal small plates.', 'mid'],
    ],
  },

  Chandigarh: {
    tourist_spot: [
      ['Rock Garden', 'Sector 1', 'Nek Chand sprawling sculpture garden built entirely from industrial waste.'],
      ['Sukhna Lake', 'Sector 1', 'Man-made lake at the foot of the Shivaliks, the city main walking promenade.'],
      ['Zakir Hussain Rose Garden', 'Sector 16', 'Asia largest rose garden with more than a thousand varieties.'],
      ['Capitol Complex', 'Sector 1', 'Le Corbusier UNESCO-listed government buildings and Open Hand monument.'],
      ['Government Museum and Art Gallery', 'Sector 10', 'Gandhara sculpture and Pahari miniature collections in a Corbusier building.'],
      ['Japanese Garden', 'Sector 31', 'Landscaped garden with pagodas, bamboo walks and a meditation deck.'],
      ['Elante Mall', 'Industrial Area Phase 1', 'North India largest mall, useful as a rainy-day stop.'],
    ],
    stay: [
      ['Taj Chandigarh', 'Sector 17', 'Business-luxury hotel a short walk from the Sector 17 plaza.', 'premium'],
      ['JW Marriott Chandigarh', 'Sector 35', 'High-rise hotel with a rooftop pool and the city best-known bar.', 'premium'],
      ['Hyatt Regency Chandigarh', 'Industrial Area Phase 1', 'Glass-fronted hotel next to Elante Mall.', 'premium'],
      ['Hotel Mountview', 'Sector 10', 'Government-run hotel with large lawns near the museum district.', 'mid'],
      ['Park Plaza Chandigarh', 'Sector 17', 'Mid-range chain hotel in the middle of the shopping sector.', 'mid'],
      ['Hometel Chandigarh', 'Industrial Area Phase 1', 'Practical mid-budget hotel aimed at longer stays.', 'mid'],
      ['Hotel Shivalikview', 'Sector 17', 'CITCO-run hotel, the most central budget option in the city.', 'budget'],
    ],
    restaurant: [
      ['Pal Dhaba', 'Sector 28', 'No-frills dhaba locally considered the benchmark for butter chicken.', 'budget'],
      ['Gopals', 'Sector 35', 'Long-running vegetarian restaurant known for chole bhature and thalis.', 'budget'],
      ['Virgin Courtyard', 'Sector 7', 'Mediterranean-leaning restaurant in a leafy courtyard setting.', 'mid'],
      ['Swagath Restaurant', 'Sector 26', 'South Indian and coastal seafood, a Chandigarh fixture for decades.', 'mid'],
      ['Whistling Duck', 'Sector 26', 'Rooftop restaurant and bar popular for weekend evenings.', 'mid'],
      ['Ghazal Restaurant', 'Sector 17', 'Old-guard North Indian dining room in the main plaza.', 'mid'],
      ['Barbeque Nation', 'Sector 26', 'Grill-at-your-table buffet chain, reliable for large groups.', 'mid'],
    ],
    cafe: [
      ['Backpackers Cafe', 'Sector 9', 'Travel-themed cafe with long hours and a big student crowd.', 'budget'],
      ['Nik Bakers', 'Sector 9', 'Bakery-cafe known across the city for its cakes and breakfasts.', 'budget'],
      ['Sector 7 Social', 'Sector 7', 'Co-working cafe by day, bar by night.', 'mid'],
      ['Cafe Delhi Heights', 'Industrial Area Phase 1', 'All-day cafe inside Elante with a broad comfort-food menu.', 'mid'],
      ['Chaayos', 'Sector 8', 'Chai chain with customisable brews, good for a quick stop.', 'budget'],
      ['Starbucks Elante', 'Industrial Area Phase 1', 'Reliable air-conditioned work spot inside the mall.', 'mid'],
      ['Barista Sector 17', 'Sector 17', 'Coffee chain outlet overlooking the Sector 17 plaza.', 'budget'],
    ],
  },

  Amritsar: {
    tourist_spot: [
      ['Golden Temple', 'Katra Ahluwalia', 'Sikhism holiest shrine, gilded and set in the middle of a sacred tank.'],
      ['Jallianwala Bagh', 'Golden Temple Road', 'Memorial garden at the site of the 1919 massacre, bullet marks still visible.'],
      ['Wagah Border', 'Attari', 'Daily sunset flag-lowering ceremony on the India-Pakistan border.'],
      ['Partition Museum', 'Town Hall', 'Oral-history museum documenting the 1947 partition through survivor accounts.'],
      ['Gobindgarh Fort', 'Lohgarh', '18th-century fort reopened as a heritage site with a nightly sound-and-light show.'],
      ['Durgiana Temple', 'Lohgarh Gate', 'Hindu temple built on the Golden Temple plan, also set in a tank.'],
      ['Maharaja Ranjit Singh Museum', 'Ram Bagh', 'Summer palace of the Sikh emperor, now a museum of arms and paintings.'],
    ],
    stay: [
      ['Taj Swarna', 'Circular Road', 'The city top luxury hotel, roughly ten minutes from the Golden Temple.', 'premium'],
      ['Hyatt Regency Amritsar', 'GT Road', 'Large modern hotel on the highway approach into town.', 'premium'],
      ['Radisson Blu Amritsar', 'GT Road', 'Business hotel with a pool, convenient for Wagah day trips.', 'premium'],
      ['Holiday Inn Amritsar Ranjit Avenue', 'Ranjit Avenue', 'Mid-scale chain hotel in the newer part of the city.', 'mid'],
      ['Hotel Ritz Plaza', 'Mall Road', 'Long-established hotel with a garden and pool, walkable to the centre.', 'mid'],
      ['Sarai Guru Ram Das', 'Golden Temple Complex', 'Pilgrim lodging run by the temple trust — very basic, minimal cost.', 'budget'],
      ['Jugaadus Eco Hostel', 'Green Avenue', 'Backpacker hostel running food walks and border-ceremony trips.', 'budget'],
    ],
    restaurant: [
      ['Kesar Da Dhaba', 'Chowk Passian', 'Since 1916, famous for ghee-laden dal and stuffed parathas.', 'budget'],
      ['Bharawan Da Dhaba', 'Town Hall', 'Vegetarian Punjabi dhaba a short walk from the Golden Temple.', 'budget'],
      ['Beera Chicken House', 'Majitha Road', 'Late-night spot known for its tandoori and butter chicken.', 'budget'],
      ['Makhan Fish & Chicken Corner', 'Majitha Road', 'Amritsari fried fish, widely held to be the city best.', 'budget'],
      ['Surjit Food Plaza', 'Lawrence Road', 'Meat-forward restaurant known for tandoori chicken and seekh kebabs.', 'mid'],
      ['Brothers Dhaba', 'Town Hall', 'Busy vegetarian thali house near the main pilgrim route.', 'budget'],
      ['Crystal Restaurant', 'Queens Road', 'Formal multi-cuisine dining room, an Amritsar landmark since the 1930s.', 'mid'],
    ],
    cafe: [
      ['Giani Tea Stall', 'Cooper Road', 'Tiny stall pouring the citys most-queued-for cup of chai.', 'budget'],
      ['Gurdas Ram Jalebi Wala', 'Katra Ahluwalia', 'Hundred-year-old jalebi counter in the bazaar near the temple.', 'budget'],
      ['Novelty Sweets', 'Lawrence Road', 'Sweet shop and snack counter, good for pinni and gulab jamun.', 'budget'],
      ['Kanha Sweets', 'Lawrence Road', 'Breakfast institution for chole bhature and lassi.', 'budget'],
      ['Ahuja Milk Bhandar', 'Moni Bazaar', 'Famous for thick malai lassi served in steel tumblers.', 'budget'],
      ['Cafe Coffee Day Heritage Street', 'Heritage Street', 'Air-conditioned break on the pedestrian approach to the temple.', 'budget'],
      ['Starbucks Amritsar', 'Alpha One Mall', 'Standard chain cafe, useful for wifi and a long sit.', 'mid'],
    ],
  },

  Mumbai: {
    tourist_spot: [
      ['Gateway of India', 'Colaba', 'Basalt arch on the waterfront, the citys default meeting point.'],
      ['Marine Drive', 'Churchgate', 'Curving seafront promenade lit up at night as the Queens Necklace.'],
      ['Chhatrapati Shivaji Maharaj Terminus', 'Fort', 'Working Victorian Gothic railway station and UNESCO World Heritage Site.'],
      ['Elephanta Caves', 'Elephanta Island', 'Rock-cut Shiva temples an hour away by ferry from the Gateway.'],
      ['Siddhivinayak Temple', 'Prabhadevi', 'The citys most visited Ganesh temple, busiest on Tuesdays.'],
      ['Haji Ali Dargah', 'Worli', 'Island shrine reached by a causeway that floods at high tide.'],
      ['Sanjay Gandhi National Park', 'Borivali', 'Forest park inside the city limits, with the 2nd-century Kanheri Caves.'],
    ],
    stay: [
      ['The Taj Mahal Palace', 'Colaba', 'The citys landmark hotel, facing the Gateway of India since 1903.', 'premium'],
      ['The Oberoi Mumbai', 'Nariman Point', 'Sea-facing luxury tower at the southern end of Marine Drive.', 'premium'],
      ['The St. Regis Mumbai', 'Lower Parel', 'High-rise luxury hotel above a mall in the central business district.', 'premium'],
      ['Trident Nariman Point', 'Nariman Point', 'Business hotel with unobstructed Marine Drive views.', 'premium'],
      ['Abode Bombay', 'Colaba', 'Small art-deco boutique hotel tucked behind the Regal cinema.', 'mid'],
      ['Sea Green Hotel', 'Marine Drive', 'Plain but well-located art-deco hotel right on the seafront.', 'mid'],
      ['Hotel Residency Fort', 'Fort', 'Compact budget hotel in the heritage business district.', 'budget'],
    ],
    restaurant: [
      ['Britannia & Co.', 'Ballard Estate', 'Parsi institution known for berry pulao, open only for lunch.', 'mid'],
      ['Trishna', 'Fort', 'Coastal seafood restaurant famous for its butter-garlic crab.', 'premium'],
      ['Bademiya', 'Colaba', 'Late-night street grill behind the Taj, running since 1946.', 'budget'],
      ['Mahesh Lunch Home', 'Fort', 'Mangalorean seafood, reliable for gassi and tandoori pomfret.', 'mid'],
      ['Highway Gomantak', 'Bandra East', 'No-frills Malvani seafood, strong on clams and bombil.', 'budget'],
      ['Cafe Madras', 'Matunga', 'South Indian breakfast institution, expect a queue for filter coffee.', 'budget'],
      ['Gajalee', 'Vile Parle', 'Long-running coastal seafood restaurant near the airport.', 'mid'],
    ],
    cafe: [
      ['Leopold Cafe', 'Colaba', 'Backpacker landmark open since 1871, always crowded.', 'mid'],
      ['Kyani & Co.', 'Marine Lines', 'Irani cafe from 1904, known for bun maska and mawa cake.', 'budget'],
      ['Yazdani Bakery', 'Fort', 'Century-old Irani bakery selling brun maska and ginger biscuits.', 'budget'],
      ['Prithvi Cafe', 'Juhu', 'Leafy courtyard cafe attached to the Prithvi Theatre.', 'budget'],
      ['Blue Tokai Coffee Roasters', 'Lower Parel', 'Specialty roaster in a mill compound, good for working.', 'mid'],
      ['Kala Ghoda Cafe', 'Kala Ghoda', 'Small specialty coffee cafe in the gallery district.', 'mid'],
      ['Cafe Mondegar', 'Colaba', 'Art-deco cafe with Mario Miranda murals and a jukebox.', 'mid'],
    ],
  },

  Shimla: {
    tourist_spot: [
      ['The Ridge', 'The Ridge', 'Open pedestrian spine of the town with views out to the snow line.'],
      ['Mall Road', 'Mall Road', 'Colonial-era shopping street, closed to vehicles.'],
      ['Jakhoo Temple', 'Jakhoo Hill', 'Hanuman temple at the towns highest point, marked by a 108-ft statue.'],
      ['Christ Church', 'The Ridge', 'Neo-Gothic church from 1857, the second oldest in north India.'],
      ['Viceregal Lodge', 'Observatory Hill', 'Former British summer seat of power, now an institute open to tours.'],
      ['Kufri', 'Kufri', 'Hill station 16 km out, used as the winter snow point.'],
      ['Summer Hill', 'Summer Hill', 'Quiet wooded suburb on the toy-train line, good for walks.'],
    ],
    stay: [
      ['Wildflower Hall', 'Chharabra', 'Former Kitchener residence turned cliff-top luxury resort in the cedars.', 'premium'],
      ['The Oberoi Cecil', 'Chaura Maidan', 'Restored colonial hotel with an atrium lounge and heated pool.', 'premium'],
      ['Clarkes Hotel', 'Mall Road', 'Shimlas oldest hotel, opened in 1898 and still on the Mall.', 'premium'],
      ['Woodville Palace', 'Chhota Shimla', 'Heritage palace hotel run by the former royal family of Jubbal.', 'mid'],
      ['Hotel Willow Banks', 'Mall Road', 'Central mid-range hotel with valley-facing rooms.', 'mid'],
      ['Hotel Combermere', 'Mall Road', 'Practical hotel connected to the Mall by its own lift.', 'mid'],
      ['YMCA Shimla', 'The Ridge', 'Historic budget lodging right beside Christ Church.', 'budget'],
    ],
    restaurant: [
      ['Ashiana & Goofa', 'The Ridge', 'Circular restaurant on the Ridge with a basement level below it.', 'mid'],
      ['Baljees', 'Mall Road', 'Shimla staple for snacks, sweets and a full North Indian menu.', 'budget'],
      ['Himachali Rasoi', 'Middle Bazaar', 'Small kitchen serving the traditional Himachali dham thali.', 'budget'],
      ['Eighteen71 Cookhouse & Bar', 'Mall Road', 'Clarkes Hotel restaurant, named for the year the building went up.', 'premium'],
      ['Devicos', 'Mall Road', 'Multi-cuisine restaurant and bar, a Mall Road fixture.', 'mid'],
      ['Sher-e-Punjab', 'Mall Road', 'Dependable Punjabi food at the lower end of the Mall.', 'budget'],
      ['Embassy Restaurant', 'Mall Road', 'Old-school dining room known for Chinese and Indian standards.', 'mid'],
    ],
    cafe: [
      ['Indian Coffee House', 'Mall Road', 'Waiter-service coffee house barely changed since the 1950s.', 'budget'],
      ['Wake & Bake Cafe', 'Mall Road', 'All-day breakfast cafe with a small valley-facing balcony.', 'mid'],
      ['Cafe Sol', 'Mall Road', 'Continental cafe on the top floor of Hotel Combermere.', 'mid'],
      ['Cafe Simla Times', 'Mall Road', 'Glass-fronted cafe looking straight down the valley.', 'mid'],
      ['Honey Hut', 'Mall Road', 'Honey-themed cafe selling local honey, shakes and ice cream.', 'budget'],
      ['Trishool Bakery', 'Lower Bazaar', 'Neighbourhood bakery good for cheap patties and buns.', 'budget'],
      ['Barista Mall Road', 'Mall Road', 'Chain cafe with heated seating, welcome in winter.', 'budget'],
    ],
  },
};

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let cityCount = 0;
    let placeCount = 0;

    for (const [cityName, categories] of Object.entries(CITIES)) {
      const { rows } = await client.query(
        `INSERT INTO cities (name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [cityName]
      );
      const cityId = rows[0].id;
      cityCount += 1;

      for (const [category, places] of Object.entries(categories)) {
        for (const [name, area, description, priceLevel = null] of places) {
          const [lat = null, lng = null] = COORDS[cityName]?.[name] ?? [];
          await client.query(
            `INSERT INTO places (city_id, category, name, area, description, price_level, lat, lng)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (city_id, category, name) DO UPDATE
               SET area = EXCLUDED.area,
                   description = EXCLUDED.description,
                   price_level = EXCLUDED.price_level,
                   lat = EXCLUDED.lat,
                   lng = EXCLUDED.lng`,
            [cityId, category, name, area, description, priceLevel, lat, lng]
          );
          placeCount += 1;
        }
      }
    }

    await client.query('COMMIT');
    console.log(`Seeded ${cityCount} cities and ${placeCount} places.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
