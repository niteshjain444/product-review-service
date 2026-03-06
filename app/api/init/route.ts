import { NextRequest, NextResponse } from 'next/server';
import { createProduct } from '@/lib/reviewService';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    console.log('Initializing demo data...');

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
        'Premium Coffee Maker',
        'A premium coffee maker with advanced brewing technology',
        'Kitchen Appliances',
        productSku
      );

      if (!product) {
        return NextResponse.json(
          { error: 'Failed to create demo product' },
          { status: 500 }
        );
      }

      productId = product.id;
      console.log(`Created demo product: ${productId}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Demo product initialized successfully',
      product_id: productId,
    });
  } catch (error) {
    console.error('Error initializing demo data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
