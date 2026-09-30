import React ,{useState} from 'react';

function App() {
  const [val, setVal] = useState([1,2,3,4,5,6])
  return(
    <div className='p-5'>
      {val.map(item => <h1>{item}</h1> )}
      <button onClick={() => setVal(()=> val.filter((item,index) => index != val.length -1 ))} className='px-2 py-1 text-white rounded-full bg-blue-500'>click</button>
    </div>
  )
}

export default App;