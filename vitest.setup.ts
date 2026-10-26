import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Sans cela, les composants d'un test restent dans le document et polluent le suivant.
afterEach(() => cleanup());
