
import { Rocket } from 'lucide-react'
import { motion } from 'motion/react'
import './App.css'

function App() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="text-center p-6"
      >
        <Rocket className="w-16 h-16 text-cyan-400 mx-auto mb-6" />

        <h1 className="text-5xl font-bold text-white">
          HACKATHON 2026
        </h1>

        <p className="text-cyan-400 mt-4 text-lg">
          Ready to Build the Future 🚀
        </p>
      </motion.div>
    </div>
  )
}

export default App
