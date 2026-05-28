<template>
  <button
    v-if="!calc.open"
    class="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full
           bg-binance-yellow text-binance-dark shadow-lg
           flex items-center justify-center text-2xl
           hover:scale-105 hover:shadow-xl transition"
    title="Máy tính Volume → Phí Alpha"
    @click="calc.show()"
  >
    🧮
  </button>
  <CalculatorModal />
</template>

<script setup>
import { useCalculatorStore } from '../stores/calculatorStore';
import CalculatorModal from './CalculatorModal.vue';

const calc = useCalculatorStore();
</script>
