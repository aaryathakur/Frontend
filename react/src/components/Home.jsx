import React from 'react'
import Nav from "./Nav"; 

const Home = () => {
  return (
    <>  
    <Nav />
    
    <div className=" w-[85%]  p-10 pt-[5%] flex flex-wrap overflow-x-hidden overflow-y-auto">
        <div className="mr-5  mb-3 card p-3 border shadow rounded w-[18%] h-[30vh] flex-col flex justify-center items-center">
          <div className="hover:scale-110 mb-3 w-full h-[80%] bg-contain bg-no-repeat bg-center"
            style={{
              backgroundImage: "url(https://fakestoreapi.com/img/81fPKd-2AYL._AC_SL1500_t.png)"
            }}
          ></div>
          <h1 className="hover:text-blue-300">Product Name</h1>
        </div>
        
      </div>
      </>
  )
}

export default Home
