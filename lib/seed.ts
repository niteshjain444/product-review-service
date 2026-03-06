import { supabase } from './supabase';
import { createProduct, submitReview, updateReviewStatus, addToModerationQueue } from './reviewService';

export async function seedDemoData() {
  console.log('Starting demo data seeding...');

  const productName = 'Premium Coffee Maker';
  const productSku = 'demo-product-001';

  const { data: existingProduct } = await supabase
    .from('products')
    .select('id')
    .eq('sku', productSku)
    .maybeSingle();

  let productId: string;

  if (existingProduct) {
    console.log('Demo product already exists');
    productId = existingProduct.id;
  } else {
    const product = await createProduct(
      productName,
      'A premium coffee maker with advanced brewing technology',
      'Kitchen Appliances',
      productSku
    );

    if (!product) {
      console.error('Failed to create demo product');
      return;
    }

    productId = product.id;
    console.log(`Created demo product: ${productId}`);
  }

  const demoReviews = [
    {
      name: 'John Smith',
      email: 'john@example.com',
      rating: 5,
      title: 'Best coffee maker Ive ever owned',
      text: 'This coffee maker has completely changed my morning routine. The brew quality is exceptional and the timer feature is incredibly convenient. Highly recommend!',
      verified: true,
      shouldAutoApprove: true,
    },
    {
      name: 'Sarah Johnson',
      email: 'sarah@example.com',
      rating: 4,
      title: 'Great coffee, minor cleanup issues',
      text: 'Makes excellent coffee and the temperature control is perfect. My only complaint is that the carafe is a bit difficult to clean, but overall Id rate it 4/5 stars.',
      verified: true,
      shouldAutoApprove: true,
    },
    {
      name: 'Mike Chen',
      email: 'mike@example.com',
      rating: 3,
      title: 'Good but had some durability concerns',
      text: 'The coffee quality is good and brewing is fast. However, after 6 months of regular use the heating element started acting up. Customer service was helpful though.',
      verified: true,
      shouldAutoApprove: true,
    },
    {
      name: 'Emily Davis',
      email: 'emily@example.com',
      rating: 5,
      title: 'Worth every penny!',
      text: 'I purchased this after reading reviews and cannot be happier. Makes barista-quality coffee at home. The compact design fits perfectly on my counter. Best purchase Ive made!',
      verified: true,
      shouldAutoApprove: true,
    },
  ];

  for (const review of demoReviews) {
    const customerId = `customer-${Date.now()}-${Math.random()}`;

    const { data: newReview, error: submitError } = await submitReview(
      productId,
      customerId,
      review.name,
      review.email,
      review.rating,
      review.title,
      review.text,
      review.verified,
      review.shouldAutoApprove ? 15 : 45
    );

    if (submitError || !newReview) {
      console.error(`Failed to submit review from ${review.name}:`, submitError);
      continue;
    }

    console.log(`Created review from ${review.name}: ${newReview.id}`);

    if (review.shouldAutoApprove) {
      await updateReviewStatus(
        newReview.id,
        'APPROVED',
        'Auto-approved: seeded demo data'
      );

      await updateReviewStatus(
        newReview.id,
        'PUBLISHED',
        'Auto-published: seeded demo data'
      );

      console.log(`Published review from ${review.name}`);
    }
  }

  console.log('Demo data seeding completed!');
}

export async function seedFlaggedReview() {
  console.log('Creating flagged review for moderation demo...');

  const { data: product } = await supabase
    .from('products')
    .select('id')
    .eq('sku', 'demo-product-001')
    .maybeSingle();

  if (!product) {
    console.error('Demo product not found');
    return;
  }

  const customerId = `customer-${Date.now()}-flagged`;

  const flaggedText = `This product is OK but check out http://spam-website.com for better deals on everything.
  CLICK HERE for our affiliate link. LIMITED OFFER available now! You won't believe these prices!
  Buy our alternative product at spamsite.biz instead!`;

  const { data: review, error } = await submitReview(
    product.id,
    customerId,
    'Flag Test User',
    'flag@test.com',
    3,
    'Suspicious review title',
    flaggedText,
    false,
    45
  );

  if (error || !review) {
    console.error('Failed to create flagged review:', error);
    return;
  }

  console.log(`Created flagged review: ${review.id}`);

  await updateReviewStatus(
    review.id,
    'FLAGGED',
    'Demo flagged for moderation testing'
  );

  await addToModerationQueue(
    review.id,
    'MEDIUM',
    'Contains spam patterns and external links - requires manual review'
  );

  console.log('Flagged review added to moderation queue');
}
