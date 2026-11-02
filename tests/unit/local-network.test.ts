import { describe, expect, it } from "vitest";

import {
  HOST_BINDING_OPTION,
  NETWORK_NAME,
  analyzeContainers,
  checkNetwork,
  exposedListeningSockets,
  externalAddresses,
  isLoopback,
} from "../../scripts/lib/local-network";

const network = (options: Record<string, string> | null, extra = {}) => [
  { Name: NETWORK_NAME, Driver: "bridge", Options: options, ...extra },
];

type Ports = Record<string, Array<{ HostIp: string; HostPort: string }> | null>;

const container = (name: string, ports: Ports, requested: Ports = ports) => ({
  Name: `/${name}`,
  NetworkSettings: { Ports: ports },
  HostConfig: { PortBindings: requested },
});

describe("isLoopback", () => {
  it.each(["127.0.0.1", "127.0.0.5", "::1", "[::1]", "localhost"])(
    "aceita %s",
    (ip) => expect(isLoopback(ip)).toBe(true),
  );
  it.each(["0.0.0.0", "::", "", "10.0.0.5", "192.168.1.10", "*"])(
    "rejeita %s",
    (ip) => expect(isLoopback(ip)).toBe(false),
  );
});

describe("checkNetwork", () => {
  it("aprova a rede presa a 127.0.0.1", () => {
    expect(
      checkNetwork(network({ [HOST_BINDING_OPTION]: "127.0.0.1" })),
    ).toEqual({
      ok: true,
    });
  });

  it.each([
    ["sem a opção", network({})],
    ["sem opções", network(null)],
    ["presa a 0.0.0.0", network({ [HOST_BINDING_OPTION]: "0.0.0.0" })],
    [
      "driver diferente",
      network({ [HOST_BINDING_OPTION]: "127.0.0.1" }, { Driver: "host" }),
    ],
    [
      "nome diferente",
      network({ [HOST_BINDING_OPTION]: "127.0.0.1" }, { Name: "outra" }),
    ],
    ["inspeção vazia", []],
    ["inspeção inválida", { qualquer: true }],
  ])("reprova rede %s", (_name, inspect) => {
    expect(checkNetwork(inspect).ok).toBe(false);
  });
});

describe("analyzeContainers", () => {
  it("aprova portas publicadas só no loopback", () => {
    const result = analyzeContainers([
      container("supabase_db_vg-rural", {
        "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "54322" }],
      }),
      container("supabase_kong_vg-rural", {
        "8000/tcp": [{ HostIp: "127.0.0.1", HostPort: "54321" }],
        "8443/tcp": null,
      }),
    ]);
    expect(result.violations).toEqual([]);
    expect(result.published.map((entry) => entry.hostPort).sort()).toEqual([
      "54321",
      "54322",
    ]);
  });

  it("usa a publicação efetiva, não o pedido sem HostIp", () => {
    const result = analyzeContainers([
      container(
        "supabase_db_vg-rural",
        { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "54322" }] },
        { "5432/tcp": [{ HostIp: "", HostPort: "54322" }] },
      ),
    ]);
    expect(result.violations).toEqual([]);
  });

  it.each([
    ["0.0.0.0", "0.0.0.0"],
    ["::", "::"],
    ["vazio (todas as interfaces)", ""],
    ["IP da rede local", "192.168.0.10"],
  ])("reprova porta publicada em %s", (_name, hostIp) => {
    const result = analyzeContainers([
      container("supabase_db_vg-rural", {
        "5432/tcp": [
          { HostIp: "127.0.0.1", HostPort: "54322" },
          { HostIp: hostIp, HostPort: "54322" },
        ],
      }),
    ]);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it("reprova quando não há containers ou portas (inconclusivo)", () => {
    expect(analyzeContainers([]).violations).not.toEqual([]);
    expect(analyzeContainers("x").violations).not.toEqual([]);
    expect(
      analyzeContainers([container("supabase_db_vg-rural", {})]).violations,
    ).not.toEqual([]);
  });

  it("reprova container fora do projeto", () => {
    const result = analyzeContainers([
      container("outro_container", {
        "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "54322" }],
      }),
    ]);
    expect(result.violations[0]).toContain("fora do projeto");
  });
});

describe("exposedListeningSockets", () => {
  it("acusa sockets da faixa local fora do loopback e ignora o resto", () => {
    const ss = [
      "LISTEN 0 4096 127.0.0.1:54322 0.0.0.0:*",
      "LISTEN 0 4096 [::1]:54321 [::]:*",
      "LISTEN 0 4096 0.0.0.0:54323 0.0.0.0:*",
      "LISTEN 0 4096 [::]:54324 [::]:*",
      "LISTEN 0 4096 0.0.0.0:22 0.0.0.0:*",
      "",
    ].join("\n");
    expect(exposedListeningSockets(ss)).toEqual([
      "0.0.0.0:54323",
      "[::]:54324",
    ]);
  });
});

describe("externalAddresses", () => {
  it("lista só endereços externos, sem loopback nem link-local", () => {
    expect(
      externalAddresses({
        lo: [{ address: "127.0.0.1", internal: true, family: "IPv4" }],
        eth0: [
          { address: "10.1.2.3", internal: false, family: "IPv4" },
          { address: "fe80::1", internal: false, family: "IPv6" },
        ],
        docker0: undefined,
      }),
    ).toEqual(["10.1.2.3"]);
  });
});
