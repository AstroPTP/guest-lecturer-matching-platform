-- Ranked matching (Suggested speakers) controls, kept on the existing
-- single-row admin_settings table. Additive, and off by default: until an
-- administrator switches it on, nothing is scored and existing rows keep
-- behaving as they did. The weights default to the standard ranking.
--
-- The three weights are whole percentages of the ranking score. The time since
-- a lecturer's last session is worth `rotation`, how few sessions they have had
-- is worth `exposure`, and how well their topics fit the session is worth `fit`.
ALTER TABLE "admin_settings"
    ADD COLUMN "suggestions_enabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "suggestions_fit_weight" INTEGER NOT NULL DEFAULT 65,
    ADD COLUMN "suggestions_rotation_weight" INTEGER NOT NULL DEFAULT 20,
    ADD COLUMN "suggestions_exposure_weight" INTEGER NOT NULL DEFAULT 15,
    ADD COLUMN "suggestions_half_life_days" INTEGER NOT NULL DEFAULT 90;

-- The API validates these first and gives a readable message; the constraints
-- are what stop a bad value reaching the table by any other route.
--
-- Fit must be at least 50 so that how well a lecturer's topics fit the session
-- always counts at least as much as the other two terms together.
ALTER TABLE "admin_settings"
    ADD CONSTRAINT "admin_settings_suggestions_weights_range" CHECK (
        "suggestions_fit_weight" BETWEEN 0 AND 100
        AND "suggestions_rotation_weight" BETWEEN 0 AND 100
        AND "suggestions_exposure_weight" BETWEEN 0 AND 100
    ),
    ADD CONSTRAINT "admin_settings_suggestions_weights_sum" CHECK (
        "suggestions_fit_weight"
        + "suggestions_rotation_weight"
        + "suggestions_exposure_weight" = 100
    ),
    ADD CONSTRAINT "admin_settings_suggestions_fit_floor" CHECK (
        "suggestions_fit_weight" >= 50
    ),
    ADD CONSTRAINT "admin_settings_suggestions_half_life_range" CHECK (
        "suggestions_half_life_days" BETWEEN 30 AND 365
    );
