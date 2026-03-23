require('dotenv').config();
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

async function createProducts() {
  // Free tier (price = 0, no Stripe product needed)
  console.log('Creating Pro and Agency products...');

  const [proProduct, agencyProduct] = await Promise.all([
    stripe.products.create({
      name: 'Creator Bot Pro',
      description: 'Unlimited members, posts, priority support'
    }),
    stripe.products.create({
      name: 'Creator Bot Agency',
      description: 'Multi-guild management, API access, custom branding'
    })
  ]);

  console.log('Created products:', proProduct.id, agencyProduct.id);

  const [proPrice, agencyPrice] = await Promise.all([
    stripe.prices.create({
      product: proProduct.id,
      unit_amount: 1500, // $15.00
      currency: 'usd',
      recurring: { interval: 'month' }
    }),
    stripe.prices.create({
      product: agencyProduct.id,
      unit_amount: 3000, // $30.00
      currency: 'usd',
      recurring: { interval: 'month' }
    })
  ]);

  console.log('Created prices:');
  console.log(`PRICE_PRO=${proPrice.id}`);
  console.log(`PRICE_AGENCY=${agencyPrice.id}`);
  console.log('Add these to your .env:');
  console.log(`PRICE_PRO=${proPrice.id}`);
  console.log(`PRICE_AGENCY=${agencyPrice.id}`);
}

createProducts().catch(console.error);