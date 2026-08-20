import "dotenv/config";
import prisma from "./src/config/db.ts";

(async () => {
  const updates = [
    {
      id: BigInt("732218438633787392"),
      name: "ooooooo",
      chainPollId: 6n,
      status: "closed", // chain state 2 = ended, not finalized -> ready to finalize
    },
    {
      id: BigInt("732686472087474176"),
      name: "pppppppppppppp",
      chainPollId: 7n,
      status: "tallied", // chain state 3 = finalized on-chain
    },
  ];

  for (const u of updates) {
    const updated = await prisma.poll.update({
      where: { id: u.id },
      data: { chainPollId: u.chainPollId, status: u.status as any },
    });
    console.log(
      `Linked "${u.name}": chainPollId=${updated.chainPollId?.toString()}, status=${updated.status}`
    );
  }
  await prisma.$disconnect();
})();