/**
 * @jest-environment node
 */

const {
  isProviderAccountAvatarImage,
  excludeProviderAccountAvatarImages,
  syncProviderAccountAvatar,
  reclaimProviderAccountAvatarSeeds,
} = require("../account-avatar");

describe("account-avatar helpers", () => {
  describe("isProviderAccountAvatarImage", () => {
    it("treats remote untyped rows without a local file as OAuth seeds", () => {
      expect(
        isProviderAccountAvatarImage({
          path: "https://lh3.googleusercontent.com/a/photo",
          public_url: "https://lh3.googleusercontent.com/a/photo",
          absolute_path: null,
          image_type: null,
        }),
      ).toBe(true);
    });

    it("never flags curated book / digital frames", () => {
      expect(
        isProviderAccountAvatarImage({
          path: "/uploads/headshot.webp",
          absolute_path: "/var/data/headshot.webp",
          image_type: "digital",
        }),
      ).toBe(false);

      expect(
        isProviderAccountAvatarImage({
          path: "https://cdn.example.com/tear.jpg",
          absolute_path: null,
          image_type: "tearsheet",
        }),
      ).toBe(false);
    });

    // Regression: an R2-backed upload has no local file and no image_type until
    // the talent labels it, and its public_url is an absolute https URL — the
    // exact shape this predicate used to call an OAuth seed. That made
    // reclaimProviderAccountAvatarSeeds delete real uploads seconds after they
    // were saved. storage_key is what distinguishes bytes we stored.
    it("never flags a freshly uploaded, unlabelled R2 frame", () => {
      expect(
        isProviderAccountAvatarImage({
          path: "https://media.pholio.studio/pholio-media/prod/profiles/p1/processed/abc.webp",
          public_url:
            "https://media.pholio.studio/pholio-media/prod/profiles/p1/processed/abc.webp",
          storage_key: "pholio-media/prod/profiles/p1/processed/abc.webp",
          absolute_path: null,
          image_type: null,
          asset_kind: "image",
        }),
      ).toBe(false);
    });
  });

  describe("excludeProviderAccountAvatarImages", () => {
    it("drops only provider seeds from a mixed list", () => {
      const rows = [
        {
          id: "seed",
          path: "https://example.com/avatar.jpg",
          absolute_path: null,
          image_type: null,
        },
        {
          id: "book",
          path: "/uploads/a.webp",
          absolute_path: "/tmp/a.webp",
          image_type: "portfolio",
        },
        {
          // Regression: R2 upload, not yet labelled — must survive the filter.
          id: "r2-frame",
          path: "https://media.pholio.studio/pholio-media/prod/profiles/p1/processed/abc.webp",
          storage_key: "pholio-media/prod/profiles/p1/processed/abc.webp",
          absolute_path: null,
          image_type: null,
        },
      ];
      expect(excludeProviderAccountAvatarImages(rows).map((r) => r.id)).toEqual([
        "book",
        "r2-frame",
      ]);
    });
  });

  describe("syncProviderAccountAvatar", () => {
    it("writes https provider pictures to users.avatar_url only", async () => {
      const updates = [];
      const db = {
        schema: { hasColumn: jest.fn().mockResolvedValue(true) },
        // knex-style builder
      };
      const builder = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ id: "u1", avatar_url: null }),
        update: jest.fn().mockImplementation(async (patch) => {
          updates.push(patch);
          return 1;
        }),
      };
      db.mockImplementation = undefined;
      const knexFn = jest.fn().mockReturnValue(builder);
      knexFn.schema = db.schema;

      const url = await syncProviderAccountAvatar(
        knexFn,
        "u1",
        "https://lh3.googleusercontent.com/a/x",
      );
      expect(url).toBe("https://lh3.googleusercontent.com/a/x");
      expect(updates).toEqual([
        { avatar_url: "https://lh3.googleusercontent.com/a/x" },
      ]);
    });

    it("ignores non-http values", async () => {
      const knexFn = jest.fn();
      knexFn.schema = { hasColumn: jest.fn() };
      expect(await syncProviderAccountAvatar(knexFn, "u1", "/uploads/x.webp")).toBe(
        null,
      );
      expect(knexFn).not.toHaveBeenCalled();
    });
  });

  describe("reclaimProviderAccountAvatarSeeds", () => {
    it("copies seed URL onto empty avatar_url and deletes the image row", async () => {
      const deleted = [];
      const userUpdates = [];
      const seed = {
        id: "img1",
        profile_id: "p1",
        path: "https://example.com/g.jpg",
        public_url: "https://example.com/g.jpg",
        absolute_path: null,
        image_type: null,
        asset_kind: null,
        user_id: "u1",
      };

      const selectBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        then: undefined,
      };
      // Make the select builder thenable
      selectBuilder.then = (resolve, reject) =>
        Promise.resolve([seed]).then(resolve, reject);

      const trx = jest.fn((table) => {
        if (table === "users") {
          return {
            where: () => ({
              first: async () => ({ id: "u1", avatar_url: null }),
              update: async (patch) => {
                userUpdates.push(patch);
                return 1;
              },
            }),
          };
        }
        if (table === "images") {
          return {
            where: () => ({
              del: async () => {
                deleted.push("img1");
                return 1;
              },
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      });

      const db = jest.fn((table) => {
        if (table === "images") {
          return {
            select: () => selectBuilder,
          };
        }
        throw new Error(`unexpected table ${table}`);
      });
      db.schema = {
        hasTable: jest.fn().mockResolvedValue(true),
        hasColumn: jest.fn().mockResolvedValue(true),
      };
      db.transaction = async (fn) => fn(trx);

      const removed = await reclaimProviderAccountAvatarSeeds(db);
      expect(removed).toBe(1);
      expect(userUpdates).toEqual([{ avatar_url: "https://example.com/g.jpg" }]);
      expect(deleted).toEqual(["img1"]);
    });
  });
});
