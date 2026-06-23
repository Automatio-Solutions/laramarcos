import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidDni,
  isValidNie,
  isValidCif,
  isValidNifCif,
  isValidIban,
  isValidEmail,
} from "../../src/lib/validators/identity.ts";

test("DNI: dígito de control", () => {
  assert.ok(isValidDni("12345678Z"));
  assert.ok(isValidDni("12345678-Z")); // normaliza guiones
  assert.ok(!isValidDni("12345678A")); // letra incorrecta
  assert.ok(!isValidDni("1234567Z")); // longitud incorrecta
});

test("NIE: X/Y/Z + control", () => {
  assert.ok(isValidNie("X1234567L"));
  assert.ok(!isValidNie("X1234567A"));
  assert.ok(!isValidNie("A1234567L")); // no empieza por X/Y/Z
});

test("CIF: control dígito y control letra", () => {
  assert.ok(isValidCif("A58818501")); // control dígito
  assert.ok(isValidCif("P1234567D")); // control letra (entidad pública)
  assert.ok(!isValidCif("A58818500")); // control incorrecto
  assert.ok(!isValidCif("A5881850")); // longitud incorrecta
});

test("isValidNifCif: despacha NIF/NIE/CIF", () => {
  assert.ok(isValidNifCif("12345678Z")); // DNI
  assert.ok(isValidNifCif("X1234567L")); // NIE
  assert.ok(isValidNifCif("A58818501")); // CIF
  assert.ok(!isValidNifCif("FOObar")); // basura
  assert.ok(!isValidNifCif("")); // vacío
});

test("IBAN: módulo 97", () => {
  assert.ok(isValidIban("ES9121000418450200051332")); // IBAN ES válido
  assert.ok(isValidIban("ES91 2100 0418 4502 0005 1332")); // con espacios
  assert.ok(!isValidIban("ES9121000418450200051333")); // dígito alterado
  assert.ok(!isValidIban("ES911234")); // longitud ES incorrecta
  assert.ok(!isValidIban("XX00")); // formato inválido
});

test("email", () => {
  assert.ok(isValidEmail("info@laramarcos.es"));
  assert.ok(!isValidEmail("info@laramarcos"));
  assert.ok(!isValidEmail("sin-arroba.es"));
});
