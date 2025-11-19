import { NextRequest, NextResponse } from 'next/server';

const CHAIN_MAP: Record<string, string> = {
  'base-sepolia': 'BASE-SEPOLIA',
  'base': 'BASE',
  'ethereum-sepolia': 'ETH-SEPOLIA',
  'ethereum': 'ETH',
};

export async function POST(request: NextRequest) {
  try {
    const { address, chain } = await request.json();

    if (!address) {
      return NextResponse.json(
        { error: 'address is required' },
        { status: 400 }
      );
    }

    const circleApiKey = process.env.CIRCLE_FAUCET_API_KEY;
    if (!circleApiKey) {
      return NextResponse.json(
        { error: 'CIRCLE_FAUCET_API_KEY is not configured' },
      { status: 500 }
    );
  }

    const blockchain = CHAIN_MAP[chain?.toLowerCase()] || 'BASE-SEPOLIA';
    const requestId = Date.now().toString();
    const requestBody = {
      usdc: true,
      blockchain: blockchain,
      address: address,
    };

    const response = await fetch('https://api.circle.com/v1/faucet/drips', {
      method: 'POST',
      headers: {
        'X-Request-Id': requestId,
        'Authorization': `Bearer ${circleApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    let responseData: any = null;
    const contentType = response.headers.get('content-type');
    const responseText = await response.text();

    if (responseText && contentType?.includes('application/json')) {
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        // Failed to parse JSON response
      }
    }

    if (!response.ok) {
      return NextResponse.json(
        { 
          error: responseData?.message || responseData?.error || `Failed to request faucet drip (${response.status})` 
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      data: responseData || { message: 'Faucet drip requested successfully' },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to request faucet drip' },
      { status: 500 }
    );
  }
}

