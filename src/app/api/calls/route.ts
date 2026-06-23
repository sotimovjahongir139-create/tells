import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type Period = 'daily' | 'weekly' | 'monthly';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const period = (searchParams.get('period') ?? 'daily') as Period;
  const manager = searchParams.get('manager') ?? undefined;
  const take = Math.min(Number(searchParams.get('take') ?? '30'), 90);

  try {
    if (period === 'daily') {
      const data = await prisma.amoCallDailyStat.findMany({
        where: manager ? { managerName: manager } : undefined,
        orderBy: { statDate: 'desc' },
        take,
      });
      return NextResponse.json(data);
    }

    if (period === 'weekly') {
      const data = await prisma.amoCallWeeklyStat.findMany({
        where: manager ? { managerName: manager } : undefined,
        orderBy: { weekStart: 'desc' },
        take,
      });
      return NextResponse.json(data);
    }

    if (period === 'monthly') {
      const data = await prisma.amoCallMonthlyStat.findMany({
        where: manager ? { managerName: manager } : undefined,
        orderBy: { monthStart: 'desc' },
        take,
      });
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: 'Invalid period' }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
