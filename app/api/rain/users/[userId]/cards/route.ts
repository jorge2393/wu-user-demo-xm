import { NextRequest, NextResponse } from 'next/server';
import { getRainClient, BASE_SEPOLIA_CHAIN_ID } from '@/lib/rainClient';

// Simple in-memory storage for demo
const cardStore = new Map<string, string>(); // rainUserId -> rainCardId

/**
 * Rain User Cards API
 * 
 * GET  - List cards for a user
 * POST - Create a new credit card for a user
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await context.params;

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    const rainClient = getRainClient();
    const cards = await rainClient.listCardsForUser(userId, 20);

    return NextResponse.json({ cards });
  } catch (error) {
    console.error('Error listing Rain cards:', error);
    return NextResponse.json(
      { error: 'Failed to list Rain cards' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await context.params;
    const { walletEmail } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    // Check if card already exists
    const existingCardId = cardStore.get(userId);
    if (existingCardId) {
      const rainClient = getRainClient();
      const card = await rainClient.getCard(existingCardId);
      
      return NextResponse.json({
        rainCardId: existingCardId,
        status: card.status,
        last4: (card.last4 || card.lastFour) as string,
        brand: card.brand,
        expMonth: card.expMonth,
        expYear: card.expYear,
      });
    }

    // Create new card
    const rainClient = getRainClient();

    // Ensure user contract exists on Base Sepolia (idempotent)
    try {
      await rainClient.createUserContract(userId, BASE_SEPOLIA_CHAIN_ID);
    } catch {}

    // Poll contracts until Base Sepolia is present (with exponential backoff)
    try {
      const contract = await rainClient.getUserContractsWithRetry(
        userId,
        BASE_SEPOLIA_CHAIN_ID,
        5 // max retries
      );
      // Contract is ready, continue with card creation
    } catch (error) {
      // If contract polling fails, still try to create card
      // (contract might exist but not be returned yet)
    }
    
    // Try to reuse existing card from API
    try {
      const cards = await rainClient.listCardsForUser(userId, 20);
      if (cards && cards.length > 0) {
        const existing = cards[0];
        cardStore.set(userId, existing.id);
        return NextResponse.json({
          rainCardId: existing.id,
          status: existing.status,
          last4: (existing.last4 || existing.lastFour) as string,
          brand: existing.brand,
          expMonth: existing.expMonth,
          expYear: existing.expYear,
        });
      }
    } catch {}

    const card = await rainClient.createCardForUser(userId, {
      displayName: walletEmail,
      limitAmount: 1000,
      status: 'active',
    });
    
    // Store mapping
    cardStore.set(userId, card.id);

    return NextResponse.json({
      rainCardId: card.id,
      status: card.status,
      last4: (card.last4 || card.lastFour) as string,
      brand: card.brand,
      expMonth: card.expMonth,
      expYear: card.expYear,
    });
  } catch (error) {
    console.error('Error creating Rain card:', error);
    return NextResponse.json(
      { error: 'Failed to create Rain card' },
      { status: 500 }
    );
  }
}
