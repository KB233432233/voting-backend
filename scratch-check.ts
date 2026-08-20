import "dotenv/config";
import prisma from "./src/config/db.ts";

(async () => {
  const polls = await prisma.poll.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      chainPollId: true,
      createdById: true,
      startDate: true,
      endDate: true,
      candidates: { select: { name: true } },
    },
  });
  console.log(
    JSON.stringify(
      polls.map((p) => ({
        id: p.id.toString(),
        name: p.name,
        status: p.status,
        chainPollId: p.chainPollId === null ? null : p.chainPollId.toString(),
        createdById: p.createdById === null ? null : p.createdById.toString(),
        endDate: p.endDate,
        candidates: p.candidates.map((c) => c.name),
      })),
      null,
      2
    )
  );
  await prisma.$disconnect();
})();